import bcrypt
import uuid

print("UUIDs:")
print("admin", uuid.uuid4())
print("tesorero", uuid.uuid4())
print("usuario", uuid.uuid4())

print("\nHashes:")
for pwd in ['admin123','tesorero123','user123']:
    h = bcrypt.hashpw(pwd.encode('utf-8'), bcrypt.gensalt()).decode('utf-8')
    print(pwd, h)