import pandas as pd
df = pd.read_excel('catalogo sigamef.xlsx')
df.to_csv('catalogo_sigamef.csv', index=False, encoding='utf-8-sig')
print("¡Conversión completada!")
