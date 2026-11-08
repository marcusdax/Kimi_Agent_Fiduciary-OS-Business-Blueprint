// Synthetic, disposable restore exercise only. Never accepts an existing database path.
import { mkdtemp, readFile, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { randomBytes, createCipheriv, createDecipheriv } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import assert from 'node:assert/strict';
const temp=await mkdtemp(join(tmpdir(),'fiduciary-synthetic-restore-'));
const backend=resolve(import.meta.dirname,'../backend'), key=randomBytes(32);
function run(command,args,env){const p=spawnSync(command,args,{cwd:backend,env:env||process.env,encoding:'utf8',timeout:30000}); if(p.status!==0)throw Error('Synthetic drill subprocess failed (inspect locally; no records logged)');return p.stdout.trim();}
const sql = (code,args=[])=>run('python3',['-c',code,...args]);
try {
 const db=join(temp,'source.db'), copy=join(temp,'snapshot.db'), restored=join(temp,'restored.db');
 run(process.execPath,['node_modules/prisma/build/index.js','migrate','deploy'],{...process.env,DATABASE_URL:`file:${db}`});
 sql(`import sqlite3,sys
c=sqlite3.connect(sys.argv[1]);c.execute('PRAGMA foreign_keys=ON')
c.execute("INSERT INTO users(id,email,password,name,updatedAt) VALUES ('restore-fixture','restore@example.invalid',NULL,'Synthetic restore fixture',CURRENT_TIMESTAMP)")
c.execute("INSERT INTO AuthSession(id,userId,expiresAt) VALUES ('restore-session','restore-fixture','2099-01-01')")
c.commit(); out=sqlite3.connect(sys.argv[2]); c.backup(out);out.close();c.close()`,[db,copy]);
 const plain=await readFile(copy), iv=randomBytes(12), cipher=createCipheriv('aes-256-gcm',key,iv);
 const encrypted=Buffer.concat([cipher.update(plain),cipher.final()]),tag=cipher.getAuthTag();
 const envelope=Buffer.concat([Buffer.from('FOSBACKUP1'),iv,tag,encrypted]);
 await writeFile(join(temp,'backup.aesgcm'),envelope,{mode:0o600});assert(!envelope.includes(Buffer.from('SQLite format 3')));
 const decode=(bytes)=>{const d=createDecipheriv('aes-256-gcm',key,bytes.subarray(10,22));d.setAuthTag(bytes.subarray(22,38));return Buffer.concat([d.update(bytes.subarray(38)),d.final()]);};
 const damaged=Buffer.from(envelope); damaged[damaged.length-1]^=1;assert.throws(()=>decode(damaged));
 const recovered=decode(envelope); assert(recovered.equals(plain)); await writeFile(restored,recovered,{mode:0o600});
 const inspect=`import sqlite3,sys,json
c=sqlite3.connect(sys.argv[1]);c.execute('PRAGMA foreign_keys=ON')
assert c.execute('PRAGMA integrity_check').fetchone()[0]=='ok'
assert c.execute('PRAGMA foreign_key_check').fetchall()==[]
assert c.execute('SELECT COUNT(*) FROM users').fetchone()[0]==1
assert c.execute('SELECT COUNT(*) FROM AuthSession').fetchone()[0]==1
print(json.dumps({'integrity':'ok','foreignKeys':'ok','syntheticUsers':1,'syntheticSessions':1,'migrations':c.execute('SELECT COUNT(*) FROM _prisma_migrations').fetchone()[0]}))`;
 const before=sql(inspect,[db]),after=sql(inspect,[restored]);assert.equal(before,after);
 console.log(JSON.stringify({encryption:'AES-256-GCM',key:'memory-only; never logged/persisted',tamperRejection:true,restore:JSON.parse(after),scope:'disposable synthetic drill; NOT production backup/KMS/retention evidence'}));
 plain.fill(0);recovered.fill(0);
} finally {key.fill(0);await rm(temp,{recursive:true,force:true});}
