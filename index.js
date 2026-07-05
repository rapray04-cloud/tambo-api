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
    const { fecha_inicio, fecha_hasta, id_insumo } = req.query;
    
    let filtroFechas = "";
    if (fecha_inicio && fecha_hasta) {
      filtroFechas = `AND m.fecha_operacion BETWEEN '${fecha_inicio}' AND '${fecha_hasta}'`;
    }

    let filtroInsumo = "";
    if (id_insumo && id_insumo !== 'TODOS') {
      filtroInsumo = `AND i.id_insumo = ${parseInt(id_insumo)}`;
    }

    // ✨ Consulta corregida: Se evalúan las fechas dentro de cada CASE WHEN para que liste SIEMPRE todos los insumos del maestro
    const query = `
      SELECT 
        i.id_insumo,
        i.codigo_producto,
        i.nombre_producto,
        i.categoria,
        i.maneja_peso,
        i.peso_teorico_kg,
        COALESCE(sl1.stock_minimo, 0) AS min_tambo_sebas,
        COALESCE(sl2.stock_minimo, 0) AS min_grandes_hermanos,
        COALESCE(sl3.stock_minimo, 0) AS min_chicken_house,
        COALESCE(sl4.stock_minimo, 0) AS min_country_club,
      COALESCE(SUM(CASE WHEN m.id_local_origen = 1 AND m.tipo_movimiento IN ('INGRESO', 'RETORNO') ${filtroFechas} THEN m.cantidad_unidades 
                          WHEN m.id_local_origen = 1 AND m.tipo_movimiento IN ('SALIDA', 'PRESTAMO') ${filtroFechas} THEN -m.cantidad_unidades
                          WHEN m.id_local_destino = 1 AND m.tipo_movimiento IN ('PRESTAMO', 'DEVOLUCION') AND m.estado_traslado = 'CONFIRMADO' ${filtroFechas} THEN m.cantidad_recibida_unidades
                          ELSE 0 END), 0) 
        + COALESCE((SELECT SUM(dd.cantidad_aprobada_admin) FROM public.ordenes_despacho od JOIN public.ordenes_despacho_detalle dd ON od.id_orden = dd.id_orden WHERE od.id_local_destino = 1 AND dd.id_insumo = i.id_insumo AND od.estado_orden = 'ENVIADO'), 0) AS tambo_sebas_unidades,
        
        COALESCE(SUM(CASE WHEN m.id_local_origen = 2 AND m.tipo_movimiento IN ('INGRESO', 'RETORNO') ${filtroFechas} THEN m.cantidad_unidades 
                          WHEN m.id_local_origen = 2 AND m.tipo_movimiento IN ('SALIDA', 'PRESTAMO') ${filtroFechas} THEN -m.cantidad_unidades
                          WHEN m.id_local_destino = 2 AND m.tipo_movimiento IN ('PRESTAMO', 'DEVOLUCION') AND m.estado_traslado = 'CONFIRMADO' ${filtroFechas} THEN m.cantidad_recibida_unidades
                          ELSE 0 END), 0)
        + COALESCE((SELECT SUM(dd.cantidad_aprobada_admin) FROM public.ordenes_despacho od JOIN public.ordenes_despacho_detalle dd ON od.id_orden = dd.id_orden WHERE od.id_local_destino = 2 AND dd.id_insumo = i.id_insumo AND od.estado_orden = 'ENVIADO'), 0) AS grandes_hermanos_unidades,
        
        COALESCE(SUM(CASE WHEN m.id_local_origen = 3 AND m.tipo_movimiento IN ('INGRESO', 'RETORNO') ${filtroFechas} THEN m.cantidad_unidades 
                          WHEN m.id_local_origen = 3 AND m.tipo_movimiento IN ('SALIDA', 'PRESTAMO') ${filtroFechas} THEN -m.cantidad_unidades
                          WHEN m.id_local_destino = 3 AND m.tipo_movimiento IN ('PRESTAMO', 'DEVOLUCION') AND m.estado_traslado = 'CONFIRMADO' ${filtroFechas} THEN m.cantidad_recibida_unidades
                          ELSE 0 END), 0)
        + COALESCE((SELECT SUM(dd.cantidad_aprobada_admin) FROM public.ordenes_despacho od JOIN public.ordenes_despacho_detalle dd ON od.id_orden = dd.id_orden WHERE od.id_local_destino = 3 AND dd.id_insumo = i.id_insumo AND od.estado_orden = 'ENVIADO'), 0) AS chicken_house_unidades,
        
        COALESCE(SUM(CASE WHEN m.id_local_origen = 4 AND m.tipo_movimiento IN ('INGRESO', 'RETORNO') ${filtroFechas} THEN m.cantidad_unidades 
                          WHEN m.id_local_origen = 4 AND m.tipo_movimiento IN ('SALIDA', 'PRESTAMO') ${filtroFechas} THEN -m.cantidad_unidades
                          WHEN m.id_local_destino = 4 AND m.tipo_movimiento IN ('PRESTAMO', 'DEVOLUCION') AND m.estado_traslado = 'CONFIRMADO' ${filtroFechas} THEN m.cantidad_recibida_unidades
                          ELSE 0 END), 0)
        + COALESCE((SELECT SUM(dd.cantidad_aprobada_admin) FROM public.ordenes_despacho od JOIN public.ordenes_despacho_detalle dd ON od.id_orden = dd.id_orden WHERE od.id_local_destino = 4 AND dd.id_insumo = i.id_insumo AND od.estado_orden = 'ENVIADO'), 0) AS country_club_unidades,
        (SELECT COALESCE(AVG(precio_total), 0) FROM movimientos WHERE id_insumo = i.id_insumo AND tipo_movimiento = 'INGRESO' AND precio_total > 0) AS costo_unitario_promedio
      FROM public.insumos i
      LEFT JOIN public.movimientos m ON i.id_insumo = m.id_insumo
      LEFT JOIN public.stock_local sl1 ON i.id_insumo = sl1.id_insumo AND sl1.id_local = 1
      LEFT JOIN public.stock_local sl2 ON i.id_insumo = sl2.id_insumo AND sl2.id_local = 2
      LEFT JOIN public.stock_local sl3 ON i.id_insumo = sl3.id_insumo AND sl3.id_local = 3
      LEFT JOIN public.stock_local sl4 ON i.id_insumo = sl4.id_insumo AND sl4.id_local = 4
      WHERE 1=1 ${filtroInsumo}
      GROUP BY i.id_insumo, i.codigo_producto, i.nombre_producto, i.categoria, i.maneja_peso, i.peso_teorico_kg, sl1.stock_minimo, sl2.stock_minimo, sl3.stock_minimo, sl4.stock_minimo
      ORDER BY i.categoria ASC, i.nombre_producto ASC;
    `;

    const result = await pool.query(query);
    res.json(result.rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ ok: false, msg: "Error al consultar la matriz consolidada" });
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
// 1. OBTENER DESPACHOS PENDIENTES (Para Planta y Alertas de Encargado)
// 1. OBTENER DESPACHOS (Historial Completo para Planta/Admin y SOLO PENDIENTES para Encargados)
app.get('/api/despachos/pendientes/:idLocal', async (req, res) => {
  try {
    const { idLocal } = req.params;
    let queryStr = "";
    let params = [];

    // Si el local es 1 (Admin o Planta de Producción), listamos TODO lo histórico para que nunca se borre
    if (parseInt(idLocal) === 1) {
      queryStr = `
        SELECT o.id_orden, o.fecha_envio, l.nombre_local as origen, i.nombre_producto as insumo, i.categoria,
               d.id_detalle, d.id_insumo, d.cantidad_aprobada_admin, o.estado_orden
        FROM public.ordenes_despacho o
        JOIN public.ordenes_despacho_detalle d ON o.id_orden = d.id_orden
        JOIN public.locales l ON o.id_local_destino = l.id_local
        JOIN public.insumos i ON d.id_insumo = i.id_insumo
        ORDER BY o.id_orden DESC
      `;
    } else {
      // 🚨 AQUÍ ESTÁ EL AJUSTE: Para el encargado de sucursal, filtramos ESTRICTAMENTE por o.estado_orden = 'ENVIADO'
      queryStr = `
        SELECT o.id_orden, o.fecha_envio, l.nombre_local as origen, i.nombre_producto as insumo, i.categoria,
               d.id_detalle, d.id_insumo, d.cantidad_aprobada_admin, o.estado_orden
        FROM public.ordenes_despacho o
        JOIN public.ordenes_despacho_detalle d ON o.id_orden = d.id_orden
        JOIN public.locales l ON o.id_local_destino = l.id_local
        JOIN public.insumos i ON d.id_insumo = i.id_insumo
        WHERE o.id_local_destino = $1 AND o.estado_orden = 'ENVIADO'
        ORDER BY o.id_orden DESC
      `;
      params.push(idLocal);
    }

    const result = await pool.query(queryStr, params);
    return res.json(result.rows);
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'Error al cargar despacho de planta' });
  }
});
// 2. CREAR Y ENVIAR NUEVA ORDEN A PLANTA DESDE MATRIZ ADMIN
app.post('/api/despachos/enviar', async (req, res) => {
  try {
    const { id_local_destino, fecha_envio, id_usuario_admin, insumos_pedidos } = req.body;

    // Insertamos la cabecera del pedido
    const resCabecera = await pool.query(
      `INSERT INTO public.ordenes_despacho (id_local_destino, fecha_envio, id_usuario_admin, estado_orden)
       VALUES ($1, $2, $3, 'ENVIADO') RETURNING id_orden`,
      [id_local_destino, fecha_envio, id_usuario_admin]
    );

    const idOrdenNueva = resCabecera.rows[0].id_orden;

    // Insertamos los detalles de cada insumo pedido
    for (const item of insumos_pedidos) {
      await pool.query(
        `INSERT INTO public.ordenes_despacho_detalle (id_orden, id_insumo, cantidad_aprobada_admin)
         VALUES ($1, $2, $3)`,
        [idOrdenNueva, item.id_insumo, item.cantidad]
      );
    }

    return res.json({ ok: true, msg: `🚀 Orden #${idOrdenNueva} registrada y enviada a la cola de producción con éxito.` });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'Error al procesar el despacho de planta' });
  }
});

// 3. RECIBIR Y DESCARGAR DESPACHO EN LA SEDE (Suma al stock_local automáticamente)
app.put('/api/despachos/recibir/:idOrden', async (req, res) => {
  try {
    const { idOrden } = req.params;
    const { id_usuario_receptor, items_recibidos } = req.body;

    // 1. Cambiamos el estado de la cabecera a ENTREGADO
    await pool.query(
      `UPDATE public.ordenes_despacho SET estado_orden = 'ENTREGADO' WHERE id_orden = $1`,
      [idOrden]
    );

    // 2. Procesamos cada insumo recibido
    for (const item of items_recibidos) {
      // Actualizamos el detalle con el conteo real del encargado
      await pool.query(
        `UPDATE public.ordenes_despacho_detalle 
         SET cantidad_recibida_local = $1, id_usuario_receptor = $2, fecha_recepcion = CURRENT_TIMESTAMP
         WHERE id_detalle = $3`,
        [item.cantidad_real, id_usuario_receptor, item.id_detalle]
      );

      // Obtenemos el ID del local destino para sumarle el stock
      const resLocal = await pool.query(`SELECT id_local_destino FROM public.ordenes_despacho WHERE id_orden = $1`, [idOrden]);
      const idLocalDestino = resLocal.rows[0].id_local_destino;

      // Sumamos la cantidad física recibida directamente en su inventario de la tabla stock_local
      await pool.query(
        `UPDATE public.stock_local 
         SET stock_unidades = stock_unidades + $1 
         WHERE id_local = $2 AND id_insumo = $3`,
        [item.cantidad_real, idLocalDestino, item.id_insumo]
      );

      // Guardamos un registro histórico en movimientos tipo INGRESO para auditoría del Excel
      await pool.query(
        `INSERT INTO public.movimientos 
         (id_insumo, tipo_movimiento, cantidad_unidades, id_local_origen, comentario, categoria, id_usuario, estado_traslado)
         VALUES ($1, 'INGRESO', $2, $3, 'DESPACHO RECIBIDO DESDE PLANTA', $4, $5, 'CONFIRMADO')`,
        [item.id_insumo, item.cantidad_real, idLocalDestino, item.categoria, id_usuario_receptor]
      );
    }

    return res.json({ ok: true, msg: '✓ Mercadería descargada, registrada en historial e inyectada al stock de la sede con éxito.' });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'Error al recibir la orden de planta' });
  }
});

// Enciende el servidor general
app.listen(PORT, () => {
  console.log(`🚀 Servidor backend activo en puerto ${PORT}`);
});
