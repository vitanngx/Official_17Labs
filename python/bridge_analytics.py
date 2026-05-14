import sys
import json
import logging
import pandas as pd
import yfinance as yf
import traceback

logging.basicConfig(level=logging.ERROR)

def run_analytics(transactions, base_currency, benchmark_symbol, date_range="ALL", mode="ACTUAL"):
    if not transactions:
        return {"ok": False, "error": "No transactions provided."}

    # Sort transactions by date
    transactions.sort(key=lambda x: x["date"])
    
    # Extract unique assets
    assets = set(t["asset"] for t in transactions if t["asset"] != base_currency)
    if benchmark_symbol:
        assets.add(benchmark_symbol)
    
    end_date = pd.Timestamp.today().strftime('%Y-%m-%d')
    today = pd.Timestamp.today()
    
    if date_range == "1M":
        filter_date = (today - pd.DateOffset(months=1)).strftime('%Y-%m-%d')
    elif date_range == "3M":
        filter_date = (today - pd.DateOffset(months=3)).strftime('%Y-%m-%d')
    elif date_range == "6M":
        filter_date = (today - pd.DateOffset(months=6)).strftime('%Y-%m-%d')
    elif date_range == "YTD":
        filter_date = today.replace(month=1, day=1).strftime('%Y-%m-%d')
    elif date_range == "1Y":
        filter_date = (today - pd.DateOffset(years=1)).strftime('%Y-%m-%d')
    elif date_range == "5Y":
        filter_date = (today - pd.DateOffset(years=5)).strftime('%Y-%m-%d')
    else:
        filter_date = transactions[0]["date"] if transactions else today.strftime('%Y-%m-%d')
        
    if mode == "BACKTEST":
        start_date_fetch = filter_date
    else:
        start_date_fetch = min(transactions[0]["date"], filter_date) if transactions else filter_date
    
    # Identify currencies needed
    asset_currencies = {}
    for t in transactions:
        asset_currencies[t["asset"]] = t.get("currency", base_currency)
    
    fx_symbols = set()
    for curr in asset_currencies.values():
        if curr != base_currency:
            fx_symbols.add(f"{curr}{base_currency}=X")
            
    all_tickers = list(assets) + list(fx_symbols)
    
    # Fetch historical prices
    prices = pd.DataFrame()
    for ticker_sym in all_tickers:
        try:
            ticker = yf.Ticker(ticker_sym)
            hist = ticker.history(start=start_date_fetch, end=end_date)
            if not hist.empty:
                prices[ticker_sym] = hist['Close']
        except Exception as e:
            logging.warning(f"Could not fetch {ticker_sym}: {e}")

    if prices.empty:
        return {"ok": False, "error": "Could not fetch any historical prices."}

    # Forward fill missing prices, then backfill
    prices = prices.ffill().bfill()
    prices.index = prices.index.tz_localize(None).strftime('%Y-%m-%d')
    
    unique_dates = sorted(list(set(prices.index.tolist() + [t["date"] for t in transactions])))
    unique_dates = [d for d in unique_dates if d <= end_date]
    if mode == "BACKTEST":
        unique_dates = [d for d in unique_dates if d >= filter_date]
        
        # Calculate current holdings exactly
        current_holdings = {asset: 0.0 for asset in assets if asset != benchmark_symbol}
        for tx in transactions:
            asset = tx["asset"]
            if tx["type"] == "BUY" and asset in current_holdings:
                current_holdings[asset] += tx["amount"]
            elif tx["type"] == "SELL" and asset in current_holdings:
                current_holdings[asset] = max(0, current_holdings[asset] - tx["amount"])
                
        daily_results = []
        for date in unique_dates:
            holdings_value = 0.0
            if date in prices.index:
                for asset, qty in current_holdings.items():
                    if qty > 0 and asset in prices.columns:
                        local_price = prices.at[date, asset]
                        if pd.notna(local_price):
                            curr = asset_currencies.get(asset, base_currency)
                            fx_rate = 1.0
                            if curr != base_currency:
                                fx_sym = f"{curr}{base_currency}=X"
                                if fx_sym in prices.columns and pd.notna(prices.at[date, fx_sym]):
                                    fx_rate = prices.at[date, fx_sym]
                            holdings_value += qty * local_price * fx_rate
            daily_results.append({
                "date": date,
                "total_value": holdings_value,
                "cash_flow": 0.0
            })
            
    else:
        holdings = {asset: 0.0 for asset in assets if asset != benchmark_symbol}
        cash = 0.0
        
        portfolio_values = []
        cash_flows = [] # For TWR
        
        t_idx = 0
        num_tx = len(transactions)
        
        daily_results = []

        for date in unique_dates:
            daily_cash_flow = 0.0
            
            # Process transactions for this date
            while t_idx < num_tx and transactions[t_idx]["date"] <= date:
                tx = transactions[t_idx]
                asset = tx["asset"]
                amount = tx["amount"]
                price = tx["price"]
                fees = tx.get("fees", 0.0)
                gross = amount * price
                
                if tx["type"] == "BUY":
                    if asset in holdings:
                        holdings[asset] += amount
                    cash -= (gross + fees)
                elif tx["type"] == "SELL":
                    if asset in holdings:
                        holdings[asset] = max(0, holdings[asset] - amount)
                    cash += (gross - fees)
                elif tx["type"] == "CASH_IN":
                    cash += (gross - fees)
                    daily_cash_flow += (gross - fees)
                elif tx["type"] == "CASH_OUT":
                    cash -= (gross + fees)
                    daily_cash_flow -= (gross + fees)
                elif tx["type"] == "DIVIDEND":
                    cash += (gross - fees)
                
                t_idx += 1
                
            # Handle implicit funding (if cash drops below 0 due to BUY without CASH_IN)
            if cash < 0:
                daily_cash_flow += abs(cash)
                cash = 0.0
                
            # Calculate End of Day Value
            holdings_value = 0.0
            if date in prices.index:
                for asset, qty in holdings.items():
                    if qty > 0 and asset in prices.columns:
                        local_price = prices.at[date, asset]
                        curr = asset_currencies.get(asset, base_currency)
                        fx_rate = 1.0
                        if curr != base_currency:
                            fx_sym = f"{curr}{base_currency}=X"
                            if fx_sym in prices.columns and pd.notna(prices.at[date, fx_sym]):
                                fx_rate = prices.at[date, fx_sym]
                        holdings_value += qty * local_price * fx_rate
            
            total_value = holdings_value + cash
            
            # Store daily state
            daily_results.append({
                "date": date,
                "total_value": total_value,
                "cash_flow": daily_cash_flow
            })

    # Calculate Time-Weighted Return (TWR) Index
    # TWR index starts at 100
    portfolio_twr = [100.0]
    dates_out = [daily_results[0]["date"]]
    
    for i in range(1, len(daily_results)):
        prev_val = daily_results[i-1]["total_value"]
        curr_val = daily_results[i]["total_value"]
        cf = daily_results[i]["cash_flow"]
        
        # Denominator is previous value + cash flow injected today
        den = prev_val + cf
        if den > 0:
            ret = (curr_val - den) / den
        else:
            ret = 0.0
            
        new_index = portfolio_twr[-1] * (1 + ret)
        portfolio_twr.append(new_index)
        dates_out.append(daily_results[i]["date"])

    benchmark_ok = True
    benchmark_twr = []
    if benchmark_symbol:
        if benchmark_symbol in prices.columns:
            # Realign to our dates_out
            reindexed_bench = prices[benchmark_symbol].reindex(dates_out).ffill().bfill()
            base_price = reindexed_bench.iloc[0]
            if base_price > 0:
                benchmark_twr = (reindexed_bench / base_price * 100).tolist()
            else:
                benchmark_twr = [100.0] * len(dates_out)
        else:
            benchmark_ok = False
            benchmark_twr = [100.0] * len(dates_out) # Fallback, but benchmark_ok flag will tell UI not to render
            
    # Filter by date_range and rebase to 100
    final_dates = []
    final_port = []
    final_bench = []
    
    for i, d in enumerate(dates_out):
        if d >= filter_date:
            final_dates.append(d)
            final_port.append(portfolio_twr[i])
            if benchmark_twr:
                final_bench.append(benchmark_twr[i])
                
    if final_dates:
        base_port = final_port[0]
        final_port = [(p / base_port * 100.0) if base_port > 0 else 100.0 for p in final_port]
        
        if final_bench:
            base_bench = final_bench[0]
            final_bench = [(b / base_bench * 100.0) if base_bench > 0 else 100.0 for b in final_bench]
            
    return {
        "ok": True,
        "dates": final_dates,
        "portfolio": final_port,
        "benchmark": final_bench,
        "benchmark_ok": benchmark_ok
    }

if __name__ == "__main__":
    try:
        input_data = sys.stdin.read()
        if not input_data.strip():
            print(json.dumps({"ok": False, "error": "Empty input"}))
            sys.exit(1)
            
        payload = json.loads(input_data)
        transactions = payload.get("transactions", [])
        base_currency = payload.get("baseCurrency", "USD")
        benchmark = payload.get("benchmark")
        date_range = payload.get("dateRange", "ALL")
        mode = payload.get("mode", "ACTUAL")
        
        result = run_analytics(transactions, base_currency, benchmark, date_range, mode)
        print(json.dumps(result))
    except Exception as e:
        logging.error("Traceback: " + traceback.format_exc())
        print(json.dumps({
            "ok": False,
            "error": str(e)
        }))
        sys.exit(1)
