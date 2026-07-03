const express = require('express');
const cors = require('cors');
const jwt = require('jsonwebtoken');
const pool = require('./db');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 5000;
const JWT_SECRET = process.env.JWT_SECRET || 'tambo_secret_ultra_key_2026';

// Middleware globales obligatorios para internet
app.use(cors());
app.use(express.json());

// =============================================================================
// 🔐 1. RUTA DE LOGIN CORREGIDA (COMPATIBLE CON NOMBRE_USUARIO Y DUPLICIDAD DE COLUMNAS)
// =============================================================================
app.post('/api/login', async (req, res) => {
  try {
    // CORRECCIÓN: Tu frontend envía 'nombre_usuario'
    const { nombre_usuario, password } = req.body;

    if (!nombre_usuario || !password) {
      return res.status(400).json({ ok: false, msg: 'Faltan credenciales obligatorias.' });
    }

    // Buscamos dinámicamente en tu tabla real usando COALESCE para tus columnas de locales
    const queryStr = `
      SELECT u.*, l.nombre_local 
      FROM public.usuarios u
      LEFT JOIN public.locales l ON l.id_local = COALESCE(u.id_local_asignado, u.id_local_assigned)
      WHERE LOWER(u.username) = $1
    `;
    const result = await pool.query(queryStr, [nombre_usuario.trim().toLowerCase()]);

    if (result.rows.length === 0) {
      return res.status(401).json({ ok: false, msg: 'Usuario o contraseña incorrectos' });
    }

    const dbUser = result.rows[0];

    // Validación limpia en texto plano (tal cual tienes tu script de inserción)
    if (dbUser.password_hash !== password.trim()) {
      return res.status(401).json({ ok: false, msg: 'Usuario o contraseña incorrectos' });
    }

    // Generamos el token JWT
    const token = jwt.sign(
      { id_usuario: dbUser.id_usuario, username: dbUser.username, id_rol: dbUser.id_rol },
      JWT_SECRET,
      { expiresIn: '24h' }
    );

    // Mapeamos el ID Local dinámicamente según la columna activa en Postgres
    const idLocalFinal = dbUser.id_local_asignado || dbUser.id_local_assigned || null;

    // Retornamos la estructura exacta que espera tu App.jsx en la línea 480
    return res.json({
      ok: true,
      token,
      user: {
        id_usuario: dbUser.id_usuario,
        username: dbUser.username,
        nombre_completo: dbUser.nombre_completo,
        id_rol: dbUser.id_rol,
        id_local: idLocalFinal,
        nombre_local: dbUser.nombre_local || 'Sede Central'
      }
    });

  } catch (err) {
    console.error('❌ Error en proceso de autenticación:', err);
    return res.status(500).json({ ok: false, msg: 'Error interno en el servidor' });
  }
});

// =============================================================================
// 🧱 2. RUTAS MÓDULO CATÁLOGO DE INSUMOS
// =============================================================================
app.get('/api/insumos', async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM public.insumos ORDER BY id_insumo ASC');
    return res.json(result.rows);
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'Error al obtener catálogo' });
  }
});

app.post('/api/insumos', async (req, res) => {
  try {
    const { nombre_producto, categoria } = req.body;
    // Generar un código único simple basado en el área
    const prefix = categoria.substring(0, 3).toUpperCase();
    const uniqueNum = Date.now().toString().slice(-4);
    const codigo_producto = `${prefix}-${uniqueNum}`;

    const queryStr = `
      INSERT INTO public.insumos (codigo_producto, nombre_producto, categoria, maneja_peso)
      VALUES ($1, $2, $3, false) RETURNING *
    `;
    await pool.query(queryStr, [codigo_producto, nombre_producto.toUpperCase(), categoria]);
    return res.json({ ok: true, msg: 'Insumo inyectado correctamente al catálogo maestro.' });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ msg: 'Error al crear el insumo.' });
  }
});

app.post('/api/insumos/importar', async (req, res) => {
  try {
    const { insumos } = req.body;
    for (const ins of insumos) {
      const prefix = ins.categoria.substring(0, 3).toUpperCase();
      const uniqueNum = Math.floor(1000 + Math.random() * 9000);
      const codigo = `${prefix}-${uniqueNum}`;
      
      await pool.query(
        `INSERT INTO public.insumos (codigo_producto, nombre_producto, categoria, maneja_peso) 
         VALUES ($1, $2, $3, false) ON CONFLICT DO NOTHING`,
        [codigo, ins.nombre_producto.toUpperCase(), ins.categoria]
      );
    }
    return res.json({ ok: true, msg: `📦 Lote masivo de insumos importado y sincronizado con éxito.` });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'Error en la importación masiva.' });
  }
});

// =============================================================================
// 🏪 3. RUTAS MÓDULO PAR STOCKS Y MÍNIMOS POR LOCAL
// =============================================================================
app.get('/api/locales/:idLocal/minimos', async (req, res) => {
  try {
    const { idLocal } = req.params;
    const queryStr = `
      SELECT i.id_insumo, i.codigo_producto, i.nombre_producto, i.categoria,
             COALESCE(sl.stock_minimo, 0.00) as stock_minimo
      FROM public.insumos i
      LEFT JOIN public.stock_local sl ON sl.id_insumo = i.id_insumo AND sl.id_local = $1
      ORDER BY i.id_insumo ASC
    `;
    const result = await pool.query(queryStr, [idLocal]);
    return res.json(result.rows);
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'Error al obtener mínimos' });
  }
});

app.put('/api/locales/:idLocal/insumos/:idInsumo/stock-minimo', async (req, res) => {
  try {
    const { idLocal, idInsumo } = req.params;
    const { stock_minimo } = req.body;

    const queryStr = `
      INSERT INTO public.stock_local (id_local, id_insumo, stock_minimo)
      VALUES ($1, $2, $3)
      ON CONFLICT (id_local, id_insumo) 
      DO UPDATE SET stock_minimo = EXCLUDED.stock_minimo
    `;
    await pool.query(queryStr, [idLocal, idInsumo, stock_minimo]);
    return res.json({ ok: true, msg: 'Mínimo actualizado.' });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'Error al actualizar mínimo' });
  }
});

// =============================================================================
// 📝 4. RUTAS MÓDULO REGISTRO DE MOVIMIENTOS E HISTORIAL
// =============================================================================
app.post('/api/movimientos', async (req, res) => {
  try {
    const {
      id_insumo, tipo_movimiento, cantidad_unidades, cantidad_kilogramos,
      merma_kilogramos, id_local_origen, id_local_destino, comentario,
      categoria, id_usuario, precio_total, fecha_retroactiva
    } = req.body;

    const queryStr = `
      INSERT INTO public.movimientos 
      (id_insumo, tipo_movimiento, cantidad_unidades, cantidad_kilogramos, merma_kilogramos, id_local_origen, id_local_destino, comentario, categoria, id_usuario, precio_total, fecha_operacion)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12) RETURNING *
    `;
    
    const result = await pool.query(queryStr, [
      id_insumo, tipo_movimiento, cantidad_unidades, cantidad_kilogramos,
      merma_kilogramos, id_local_origen, id_local_destino || null, comentario,
      categoria, id_usuario, precio_total, fecha_retroactiva
    ]);

    return res.json({ ok: true, data: result.rows[0] });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'Error al registrar movimiento' });
  }
});

app.get('/api/reportes', async (req, res) => {
  try {
    const { fecha_inicio, fecha_fin, id_insumo } = req.query;
    let filterInsumo = '';
    const params = [fecha_inicio, fecha_fin];

    if (id_insumo && id_insumo !== 'TODOS') {
      filterInsumo = 'AND m.id_insumo = $3';
      params.push(id_insumo);
    }

    const queryStr = `
      SELECT 
        m.id_movimiento as "Nro",
        TO_CHAR(m.fecha_operacion, 'DD/MM/YYYY') as "Fecha_Hora",
        lo.nombre_local as "Origen",
        m.tipo_movimiento as "Operacion",
        m.categoria as "Categoria",
        i.nombre_producto as "Insumo",
        m.cantidad_unidades as "Unds",
        m.cantidad_kilogramos as "Kilos",
        ld.nombre_local as "Destino",
        m.merma_kilogramos,
        m.precio_total as "Total_Soles",
        m.comentario,
        u.nombre_completo as "Encargado"
      FROM public.movimientos m
      JOIN public.insumos i ON i.id_insumo = m.id_insumo
      JOIN public.locales lo ON lo.id_local = m.id_local_origen
      LEFT JOIN public.locales ld ON ld.id_local = m.id_local_destino
      JOIN public.usuarios u ON u.id_usuario = m.id_usuario
      WHERE m.fecha_operacion BETWEEN $1 AND $2 ${filterInsumo}
      ORDER BY m.id_movimiento DESC
    `;

    const result = await pool.query(queryStr, params);
    return res.json(result.rows);
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'Error al cargar historial' });
  }
});

app.put('/api/movimientos/:idMovimiento/costo', async (req, res) => {
  try {
    const { idMovimiento } = req.params;
    const { precio_total } = req.body;
    await pool.query('UPDATE public.movimientos SET precio_total = $1 WHERE id_movimiento = $2', [precio_total, idMovimiento]);
    return res.json({ ok: true });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'Error al asignar costo' });
  }
});

// =============================================================================
// 📊 5. RUTA MATRIZ DE STOCKS COMPLETA CRUCES DINÁMICOS
// =============================================================================
app.get('/api/stock-actual', async (req, res) => {
  try {
    const { id_insumo } = req.query;
    let filterInsumo = '';
    const params = [];

    if (id_insumo && id_insumo !== 'TODOS') {
      filterInsumo = 'WHERE i.id_insumo = $1';
      params.push(id_insumo);
    }

    const queryStr = `
      SELECT 
        i.id_insumo,
        i.codigo_producto,
        i.nombre_producto,
        i.categoria,
        i.maneja_peso,
        -- Tambo Sebas (ID 1)
        COALESCE((SELECT stock_unidades FROM public.stock_local WHERE id_local = 1 AND id_insumo = i.id_insumo), 0) as tambo_sebas_unidades,
        COALESCE((SELECT stock_minimo FROM public.stock_local WHERE id_local = 1 AND id_insumo = i.id_insumo), 0) as min_tambo_sebas,
        -- Grande Hermanos (ID 2)
        COALESCE((SELECT stock_unidades FROM public.stock_local WHERE id_local = 2 AND id_insumo = i.id_insumo), 0) as grandes_hermanos_unidades,
        COALESCE((SELECT stock_minimo FROM public.stock_local WHERE id_local = 2 AND id_insumo = i.id_insumo), 0) as min_grandes_hermanos,
        -- Chicken House (ID 3)
        COALESCE((SELECT stock_unidades FROM public.stock_local WHERE id_local = 3 AND id_insumo = i.id_insumo), 0) as chicken_house_unidades,
        COALESCE((SELECT stock_minimo FROM public.stock_local WHERE id_local = 3 AND id_insumo = i.id_insumo), 0) as min_chicken_house,
        -- Country Club (ID 4)
        COALESCE((SELECT stock_unidades FROM public.stock_local WHERE id_local = 4 tactics AND id_insumo = i.id_insumo), 0) as country_club_unidades,
        COALESCE((SELECT stock_minimo FROM public.stock_local WHERE id_local = 4 AND id_insumo = i.id_insumo), 0) as min_country_club,
        -- Costo promedio referencial en 0 base
        0.00 as costo_unitario_promedio
      FROM public.insumos i
      ${filterInsumo}
      ORDER BY i.id_insumo ASC
    `;

    const result = await pool.query(queryStr, params);
    return res.json(result.rows);
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'Error en cálculo de matriz' });
  }
});

// =============================================================================
// 🚚 6. RUTAS COMPLEMENTARIAS TRASLADOS Y COLA DE DESPACHOS PLANTA
// =============================================================================
app.get('/api/movimientos/pendientes/:idLocal', async (req, res) => {
  try {
    const { idLocal } = req.params;
    const queryStr = `
      SELECT m.id_movimiento, i.nombre_producto as insumo, lo.nombre_local as origen,
             m.cantidad_unidades, m.categoria
      FROM public.movimientos m
      JOIN public.insumos i ON i.id_insumo = m.id_insumo
      JOIN public.locales lo ON lo.id_local = m.id_local_origen
      WHERE m.id_local_destino = $1 AND m.tipo_movimiento = 'PRESTAMO' AND m.estado_traslado = 'PENDIENTE'
    `;
    const result = await pool.query(queryStr, [idLocal]);
    return res.json(result.rows);
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'Error al cargar pendientes' });
  }
});

app.put('/api/movimientos/:idMovimiento/confirmar-traslado', async (req, res) => {
  try {
    const { idMovimiento } = req.params;
    const { cantidad_recibida } = req.body;
    
    // Cambiar estado a confirmado
    await pool.query(
      `UPDATE public.movimientos 
       SET estado_traslado = 'CONFIRMADO', cantidad_recibida_unidades = $1 
       WHERE id_movimiento = $2`,
      [cantidad_recibida, idMovimiento]
    );
    return res.json({ ok: true, msg: '🚚 Traslado descargado y sumado al stock del local con éxito.' });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'Error al confirmar traslado' });
  }
});

// Rutas Mock de la cola de despachos para que no tire error 404 tu App.jsx
app.get('/api/despachos/pendientes/:idLocal', async (req, res) => {
  return res.json([]);
});

app.post('/api/despachos/enviar', async (req, res) => {
  return res.json({ ok: true, msg: 'Orden enviada a planta de forma virtual.' });
});

app.put('/api/despachos/recibir/:idOrden', async (req, res) => {
  return res.json({ ok: true, msg: 'Despacho recibido.' });
});

// Enciende el servidor general
app.listen(PORT, () => {
  console.log(`🚀 Servidor backend activo en puerto ${PORT}`);
});