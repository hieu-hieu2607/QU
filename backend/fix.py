import re
with open('train_model.py', 'r', encoding='utf-8') as f: code = f.read()
code = re.sub(r"'VSH',?\s*|'QNS',?\s*|'VGI',?\s*|'POM',?\s*|'MBS',?\s*|'HBC',?\s*|'ACV',?\s*", '', code)
with open('train_model.py', 'w', encoding='utf-8') as f: f.write(code)
with open('app/api/prediction.py', 'r', encoding='utf-8') as f: code = f.read()
code = re.sub(r"'VSH',?\s*|'QNS',?\s*|'VGI',?\s*|'POM',?\s*|'MBS',?\s*|'HBC',?\s*|'ACV',?\s*", '', code)
with open('app/api/prediction.py', 'w', encoding='utf-8') as f: f.write(code)
