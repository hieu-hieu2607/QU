import re
bad_tickers = ['VSH', 'QNS', 'VGI', 'POM', 'MBS', 'HBC', 'ACV']
for file in ['train_model.py', 'app/api/prediction.py']:
    with open(file, 'r', encoding='utf-8') as f: code = f.read()
    for t in bad_tickers:
        code = code.replace(f\"'{t}', \", '').replace(f\"'{t}'\", '')
    with open(file, 'w', encoding='utf-8') as f: f.write(code)
