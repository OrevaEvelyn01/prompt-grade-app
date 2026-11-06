import sqlite3
conn = sqlite3.connect('prompt_eval.db')
conn.execute("UPDATE generated_outputs SET is_modified = 'no' WHERE is_modified IS NULL")
conn.commit()
conn.close()
print('Done')