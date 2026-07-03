const { Pool } = require('pg');
require('dotenv').config();

// Conexión unificada mediante URL compatible con Neon y Render
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: {
    rejectUnauthorized: false // Obligatorio para certificados SSL seguros de Neon
  }
});

// Tu prueba rápida para verificar la conexión en la consola
pool.query('SELECT NOW()', (err, res) => {
  if (err) {
    console.error('❌ Error conectando a la base de datos en la nube:', err.stack);
  } else {
    console.log('✅ Node.js conectado con éxito a PostgreSQL en Neon.');
  }
});

module.exports = pool;