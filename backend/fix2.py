for file in ['train_model.py', 'app/api/prediction.py']:
    with open(file, 'r', encoding='utf-8') as f: code = f.read()
    code = code.replace("'REE', ", "").replace("'REE'", "")
    with open(file, 'w', encoding='utf-8') as f: f.write(code)
print('Done - REE removed')
