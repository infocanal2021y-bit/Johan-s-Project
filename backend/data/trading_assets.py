"""Global asset catalog for Trading Demo.

All prices are synthetic — simulated via random-walk + sine wave seeded by the symbol hash.
No real-time data feed is required: the chart endpoint produces plausible OHLCV candles for any
symbol registered here.
"""

# ────────── FOREX (28 pairs) ──────────
FOREX = {
    # Majors
    'EURUSD': 1.0862, 'GBPUSD': 1.2714, 'USDJPY': 154.32, 'USDCHF': 0.882,
    'AUDUSD': 0.652, 'USDCAD': 1.365, 'NZDUSD': 0.595,
    # Crosses
    'EURGBP': 0.855, 'EURJPY': 167.50, 'GBPJPY': 196.20, 'EURCHF': 0.958,
    'AUDJPY': 100.50, 'CADJPY': 113.00, 'CHFJPY': 175.00,
    'EURCAD': 1.483, 'EURAUD': 1.667, 'GBPAUD': 1.950, 'GBPCAD': 1.735,
    'GBPCHF': 1.121, 'AUDCAD': 0.890, 'AUDCHF': 0.575, 'AUDNZD': 1.096,
    'NZDJPY': 91.80, 'EURNZD': 1.826,
    # Exotics
    'USDTRY': 34.52, 'USDMXN': 20.15, 'USDZAR': 18.50, 'USDSEK': 10.65,
}

# ────────── INDICES (20 global) ──────────
INDICES = {
    # US
    'SPX500': 5850.0, 'US30': 42100.0, 'NAS100': 20500.0, 'RUS2000': 2330.0, 'VIX': 15.50,
    # Europe
    'UK100': 8250.0, 'GER40': 19450.0, 'FRA40': 7450.0, 'EU50': 4950.0,
    'ESP35': 11650.0, 'ITA40': 34200.0, 'NED25': 890.0, 'SWI20': 11850.0,
    # Asia-Pacific
    'JPN225': 38500.0, 'HK50': 19800.0, 'AUS200': 8100.0, 'CHN50': 13200.0, 'IND50': 23400.0,
    # LatAm
    'BRA60': 128500.0, 'MEX35': 53800.0,
}

# ────────── COMMODITIES (12) ──────────
COMMODITIES = {
    # Precious metals
    'XAUUSD': 2345.50, 'XAGUSD': 30.85, 'XPTUSD': 950.50, 'XPDUSD': 980.0,
    # Energy
    'USOIL': 68.50, 'UKOIL': 72.30, 'NATGAS': 2.85,
    # Industrial
    'COPPER': 4.22,
    # Soft
    'WHEAT': 5.65, 'CORN': 4.20, 'COFFEE': 255.0, 'SUGAR': 20.50,
}

# ────────── CRYPTO (25) ──────────
CRYPTO = {
    'BTCUSD': 67420.0, 'ETHUSD': 3215.0, 'SOLUSD': 145.0, 'BNBUSD': 585.0,
    'XRPUSD': 0.58, 'ADAUSD': 0.38, 'DOGEUSD': 0.155, 'AVAXUSD': 28.5,
    'DOTUSD': 6.85, 'MATICUSD': 0.48, 'LINKUSD': 13.2, 'LTCUSD': 82.0,
    'UNIUSD': 7.30, 'ATOMUSD': 6.40, 'ETCUSD': 22.0, 'XLMUSD': 0.105,
    'NEARUSD': 4.85, 'FILUSD': 4.20, 'APTUSD': 8.50, 'ICPUSD': 8.20,
    'HBARUSD': 0.078, 'VETUSD': 0.032, 'ALGOUSD': 0.18, 'TRXUSD': 0.155,
    'SHIBUSD': 0.0000185,
}

# ────────── US STOCKS (50 mega/large-cap) ──────────
STOCKS_US = {
    'AAPL': 226.0, 'MSFT': 410.0, 'GOOGL': 168.0, 'AMZN': 192.0, 'NVDA': 138.0,
    'META': 560.0, 'TSLA': 250.0, 'BRKB': 445.0, 'JPM': 215.0, 'V': 275.0,
    'UNH': 570.0, 'JNJ': 156.0, 'WMT': 82.0, 'PG': 168.0, 'MA': 478.0,
    'HD': 385.0, 'XOM': 115.0, 'CVX': 155.0, 'LLY': 815.0, 'ABBV': 175.0,
    'PFE': 28.0, 'MRK': 115.0, 'KO': 64.0, 'PEP': 170.0, 'CSCO': 55.0,
    'BAC': 40.0, 'WFC': 60.0, 'TMO': 560.0, 'ABT': 110.0, 'ADBE': 520.0,
    'CRM': 275.0, 'NFLX': 690.0, 'DIS': 95.0, 'ORCL': 145.0, 'AMD': 155.0,
    'INTC': 22.0, 'QCOM': 155.0, 'IBM': 210.0, 'TXN': 200.0, 'PYPL': 75.0,
    'SHOP': 85.0, 'UBER': 75.0, 'SBUX': 98.0, 'NKE': 82.0, 'MCD': 295.0,
    'DHR': 250.0, 'COST': 870.0, 'LOW': 265.0, 'AXP': 265.0, 'CAT': 385.0,
}

# ────────── EU STOCKS (25 blue-chip) ──────────
STOCKS_EU = {
    'LVMH': 690.0, 'LOREAL': 395.0, 'NOVO': 900.0, 'NESTLE': 85.0, 'SAP': 215.0,
    'ASML': 675.0, 'SIEMENS': 175.0, 'ALLIANZ': 295.0, 'DTELEKOM': 28.0, 'SCHNEIDER': 215.0,
    'AIRBUS': 165.0, 'BNPPAR': 63.0, 'SANTANDER': 4.80, 'BBVA': 10.20, 'IBERDROLA': 13.50,
    'INDITEX': 52.0, 'TELEFONICA': 4.00, 'REPSOL': 12.80, 'ROCHE': 255.0, 'NOVARTIS': 95.0,
    'HSBC': 6.95, 'BP': 3.85, 'SHELL': 25.50, 'UNILEVER': 48.0, 'GSK': 14.80,
}

# ────────── LATAM STOCKS (10) ──────────
STOCKS_LATAM = {
    'VALE': 52.0, 'ITUB': 5.85, 'PETR': 35.0, 'BBD': 2.45, 'AMX': 14.5,
    'WALMEX': 62.5, 'GFNORTE': 145.0, 'FEMSA': 215.0, 'CEMEX': 6.25, 'AC': 195.0,
}

# Merge all
ALL_BASE_PRICES = {**FOREX, **INDICES, **COMMODITIES, **CRYPTO, **STOCKS_US, **STOCKS_EU, **STOCKS_LATAM}


# ────────── ASSET INFO (name, pip, spread, category, label) ──────────

def _forex_info(pair):
    is_jpy = pair.endswith('JPY')
    pip = 0.01 if is_jpy else 0.0001
    spread = 0.015 if is_jpy else 0.00015
    label = f"{pair[:3]}/{pair[3:]}"
    return {'name': label, 'pip': pip, 'spread': spread, 'category': 'forex', 'label': label}


def _index_info(symbol, label, decimals=1):
    return {'name': label, 'pip': 10 ** -decimals, 'spread': 1.5, 'category': 'index', 'label': label}


def _commodity_info(symbol, name, pip=0.01, spread=0.35):
    return {'name': name, 'pip': pip, 'spread': spread, 'category': 'commodity', 'label': name}


def _crypto_info(symbol, pip=0.01, spread_pct=0.001):
    label = symbol[:-3] + '/USD'
    price = CRYPTO.get(symbol, 1.0)
    # Adjust pip for micro-priced coins (SHIB, etc.)
    if price < 0.001:
        pip = 0.00000001
    elif price < 0.1:
        pip = 0.00001
    elif price < 10:
        pip = 0.001
    return {'name': label, 'pip': pip, 'spread': max(0.01, price * spread_pct), 'category': 'crypto', 'label': label}


def _stock_info(symbol, name, category='stock_us'):
    price = ALL_BASE_PRICES.get(symbol, 1.0)
    pip = 0.01
    spread = max(0.05, price * 0.0008)
    return {'name': name, 'pip': pip, 'spread': spread, 'category': category, 'label': symbol}


# Friendly names for indices
INDEX_NAMES = {
    'SPX500': 'S&P 500', 'US30': 'Dow Jones 30', 'NAS100': 'Nasdaq 100', 'RUS2000': 'Russell 2000',
    'VIX': 'VIX Volatility', 'UK100': 'FTSE 100', 'GER40': 'DAX 40', 'FRA40': 'CAC 40',
    'EU50': 'Euro Stoxx 50', 'ESP35': 'IBEX 35', 'ITA40': 'FTSE MIB', 'NED25': 'AEX 25',
    'SWI20': 'SMI 20', 'JPN225': 'Nikkei 225', 'HK50': 'Hang Seng', 'AUS200': 'ASX 200',
    'CHN50': 'China A50', 'IND50': 'Nifty 50', 'BRA60': 'Bovespa', 'MEX35': 'IPC Mexico',
}

COMMODITY_NAMES = {
    'XAUUSD': 'Oro (Gold)', 'XAGUSD': 'Plata (Silver)', 'XPTUSD': 'Platino', 'XPDUSD': 'Paladio',
    'USOIL': 'Petroleo WTI', 'UKOIL': 'Petroleo Brent', 'NATGAS': 'Gas Natural',
    'COPPER': 'Cobre', 'WHEAT': 'Trigo', 'CORN': 'Maiz', 'COFFEE': 'Cafe', 'SUGAR': 'Azucar',
}

STOCK_US_NAMES = {
    'AAPL': 'Apple Inc.', 'MSFT': 'Microsoft', 'GOOGL': 'Alphabet (Google)', 'AMZN': 'Amazon',
    'NVDA': 'NVIDIA', 'META': 'Meta Platforms', 'TSLA': 'Tesla', 'BRKB': 'Berkshire Hathaway',
    'JPM': 'JPMorgan Chase', 'V': 'Visa', 'UNH': 'UnitedHealth', 'JNJ': 'Johnson & Johnson',
    'WMT': 'Walmart', 'PG': 'Procter & Gamble', 'MA': 'Mastercard', 'HD': 'Home Depot',
    'XOM': 'Exxon Mobil', 'CVX': 'Chevron', 'LLY': 'Eli Lilly', 'ABBV': 'AbbVie',
    'PFE': 'Pfizer', 'MRK': 'Merck', 'KO': 'Coca-Cola', 'PEP': 'PepsiCo', 'CSCO': 'Cisco',
    'BAC': 'Bank of America', 'WFC': 'Wells Fargo', 'TMO': 'Thermo Fisher', 'ABT': 'Abbott',
    'ADBE': 'Adobe', 'CRM': 'Salesforce', 'NFLX': 'Netflix', 'DIS': 'Disney', 'ORCL': 'Oracle',
    'AMD': 'AMD', 'INTC': 'Intel', 'QCOM': 'Qualcomm', 'IBM': 'IBM', 'TXN': 'Texas Instruments',
    'PYPL': 'PayPal', 'SHOP': 'Shopify', 'UBER': 'Uber', 'SBUX': 'Starbucks', 'NKE': 'Nike',
    'MCD': "McDonald's", 'DHR': 'Danaher', 'COST': 'Costco', 'LOW': "Lowe's", 'AXP': 'American Express', 'CAT': 'Caterpillar',
}

STOCK_EU_NAMES = {
    'LVMH': 'LVMH (Louis Vuitton)', 'LOREAL': "L'Oreal", 'NOVO': 'Novo Nordisk', 'NESTLE': 'Nestle',
    'SAP': 'SAP', 'ASML': 'ASML Holding', 'SIEMENS': 'Siemens', 'ALLIANZ': 'Allianz',
    'DTELEKOM': 'Deutsche Telekom', 'SCHNEIDER': 'Schneider Electric', 'AIRBUS': 'Airbus',
    'BNPPAR': 'BNP Paribas', 'SANTANDER': 'Banco Santander', 'BBVA': 'BBVA', 'IBERDROLA': 'Iberdrola',
    'INDITEX': 'Inditex (Zara)', 'TELEFONICA': 'Telefonica', 'REPSOL': 'Repsol', 'ROCHE': 'Roche',
    'NOVARTIS': 'Novartis', 'HSBC': 'HSBC Holdings', 'BP': 'BP', 'SHELL': 'Shell', 'UNILEVER': 'Unilever', 'GSK': 'GSK',
}

STOCK_LATAM_NAMES = {
    'VALE': 'Vale (Brasil)', 'ITUB': 'Itau Unibanco', 'PETR': 'Petrobras', 'BBD': 'Bradesco',
    'AMX': 'America Movil', 'WALMEX': 'Walmart Mexico', 'GFNORTE': 'Banorte', 'FEMSA': 'FEMSA',
    'CEMEX': 'Cemex', 'AC': 'Arca Continental',
}


def build_asset_info():
    info = {}
    for sym in FOREX:
        info[sym] = _forex_info(sym)
    for sym, price in INDICES.items():
        decimals = 2 if sym == 'VIX' else 1
        info[sym] = _index_info(sym, INDEX_NAMES.get(sym, sym), decimals)
    for sym in COMMODITIES:
        info[sym] = _commodity_info(sym, COMMODITY_NAMES.get(sym, sym))
    for sym in CRYPTO:
        info[sym] = _crypto_info(sym)
    for sym, name in STOCK_US_NAMES.items():
        info[sym] = _stock_info(sym, name, 'stock_us')
    for sym, name in STOCK_EU_NAMES.items():
        info[sym] = _stock_info(sym, name, 'stock_eu')
    for sym, name in STOCK_LATAM_NAMES.items():
        info[sym] = _stock_info(sym, name, 'stock_latam')
    return info


ALL_ASSET_INFO = build_asset_info()

CATEGORIES = {
    'forex': {'label': 'Forex', 'icon': 'Globe', 'count': len(FOREX)},
    'index': {'label': 'Indices', 'icon': 'BarChart3', 'count': len(INDICES)},
    'commodity': {'label': 'Materias Primas', 'icon': 'Gem', 'count': len(COMMODITIES)},
    'crypto': {'label': 'Criptomonedas', 'icon': 'Bitcoin', 'count': len(CRYPTO)},
    'stock_us': {'label': 'Acciones USA', 'icon': 'Building2', 'count': len(STOCK_US_NAMES)},
    'stock_eu': {'label': 'Acciones Europa', 'icon': 'Building', 'count': len(STOCK_EU_NAMES)},
    'stock_latam': {'label': 'Acciones LatAm', 'icon': 'Building', 'count': len(STOCK_LATAM_NAMES)},
}
