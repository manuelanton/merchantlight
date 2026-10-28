const {neon}=require('@neondatabase/serverless');
const sql=neon(process.env.DATABASE_URL);
sql("UPDATE members SET role='member', active=true WHERE lower(name) LIKE '%kanu%' OR lower(name) LIKE '%dog%' OR lower(name) LIKE '%gerra%'").then(async()=>{
  const r = await sql("SELECT name,role,active FROM members WHERE lower(name) LIKE '%kanu%' OR lower(name) LIKE '%dog%' OR lower(name) LIKE '%gerra%'");
  console.log(JSON.stringify(r));
  process.exit(0);
}).catch(e=>{console.error(e.message);process.exit(1)});
