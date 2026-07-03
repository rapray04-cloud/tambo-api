const express = require('express');
const cors = require('cors');
const pool = require('./db');
const bcrypt = require('bcryptjs'); 
const jwt = require('jsonwebtoken');
const app = express();
const PORT = process.env.PORT || 5000;
const JWT_SECRET = process.env.JWT_SECRET || 'TuClaveSecretaSuperSegura2026';

app.use(cors());
app.use(express.json());

// 🛡️ MIDDLEWARE PARA PROTEGER RUTAS
const verificarToken = (req, res, next) => {
    const token = req.headers['authorization']?.split(' ')[1];
    if (!token) {
        return res.status(403).json({ ok: false, msg: 'No se proporcionó un token de seguridad.' });
    }
    try {
        const verificado = jwt.verify(token, JWT_SECRET);
        req.usuario = verificado; 
        next();
    } catch (error) {
        return res.status(401).json({ ok: false, msg: 'Token inválido o expirado.' });
    }
};

// 🔐 RUTA LOGIN (Restaurada con tu lógica original exacta de texto plano + bcrypt)
app.post('/api/login', async (req, res) => {
    const { nombre_usuario, password } = req.body;
    try {
        const usuarioQuery = await pool.query(
            `SELECT u.id_usuario, u.username, u.nombre_completo, u.id_rol, u.password_hash, u.id_local_asignado AS id_local, l.nombre_local 
             FROM usuarios u 
             JOIN locales l ON u.id_local_asignado = l.id_local
             WHERE LOWER(TRIM(u.username)) = LOWER(TRIM($1))`,
            [nombre_usuario]
        );

        if (usuarioQuery.rows.length === 0) {
            return res.status(401).json({ ok: false, msg: 'Usuario o contraseña incorrectos.' });
        }

        const usuario = usuarioQuery.rows[0];
        
        // 🔄 Tu validación original exacta: Compara encriptado O texto plano directo
        const passwordCorrecto = await bcrypt.compare(password.trim(), usuario.password_hash.trim());
        const esTextoPlanoOkey = password.trim() === usuario.password_hash.trim();

        if (!passwordCorrecto && !esTextoPlanoOkey) {
            return res.status(401).json({ ok: false, msg: 'Usuario o contraseña incorrectos.' });
        }

        const token = jwt.sign(
            { id_usuario: usuario.id_usuario, id_rol: usuario.id_rol, id_local: usuario.id_local },
            JWT_SECRET,
            { expiresIn: '10h' }
        );
        delete usuario.password_hash;

        res.json({ 
            ok: true, 
            msg: 'Login correcto', 
            token, 
            user: usuario 
        });
    } catch (error) {
        res.status(500).json({ ok: false, msg: 'Error en el servidor.' });
    }
});

// 🥩 CATÁLOGO DE INSUMOS CORREGIDO
app.get('/api/insumos', verificarToken, async (req, res) => {
    try {
        const resultado = await pool.query(
            'SELECT id_insumo, codigo_producto, nombre_producto, categoria, maneja_peso FROM insumos ORDER BY nombre_producto ASC'
        );
        res.json(resultado.rows);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// 🔍 OBTENER MÍNIMOS CONFIGURADOS DE UN LOCAL ESPECÍFICO
app.get('/api/locales/:id_local/minimos', verificarToken, async (req, res) => {
    const { id_local } = req.params;
    try {
        const query = `
            SELECT i.id_insumo, i.nombre_producto, i.codigo_producto, i.categoria,
                   COALESCE(sl.stock_minimo, 0.00) AS stock_minimo
            FROM insumos i
            LEFT JOIN stock_local sl ON i.id_insumo = sl.id_insumo AND sl.id_local = $1
            ORDER BY i.nombre_producto ASC;
        `;
        const resultado = await pool.query(query, [parseInt(id_local)]);
        res.json(resultado.rows);
    } catch (error) {
        res.status(500).json({ ok: false, msg: `Error al traer mínimos: ${error.message}` });
    }
});

// 🔔 ACTUALIZAR STOCK MÍNIMO EN CALIENTE POR LOCAL INDEPENDIENTE
app.put('/api/locales/:id_local/insumos/:id_insumo/stock-minimo', verificarToken, async (req, res) => {
    const { id_local, id_insumo } = req.params;
    const { stock_minimo } = req.body;

    if (stock_minimo === undefined || isNaN(stock_minimo) || parseFloat(stock_minimo) < 0) {
        return res.status(400).json({ ok: false, msg: 'Stock mínimo inválido.' });
    }

    try {
        await pool.query(
            `INSERT INTO stock_local (id_local, id_insumo, stock_minimo) 
             VALUES ($1, $2, $3) 
             ON CONFLICT (id_local, id_insumo) 
             DO UPDATE SET stock_minimo = EXCLUDED.stock_minimo`,
            [parseInt(id_local), parseInt(id_insumo), parseFloat(stock_minimo)]
        );
        return res.status(200).json({ ok: true, msg: '🔔 Stock mínimo del local actualizado correctamente.' });
    } catch (error) {
        return res.status(500).json({ ok: false, msg: `Error al actualizar stock mínimo: ${error.message}` });
    }
});

// ➕ REGISTRAR NUEVO INSUMO MAESTRO
app.post('/api/insumos', verificarToken, async (req, res) => {
    const { nombre_producto, categoria } = req.body;
    if (!nombre_producto || !categoria) {
        return res.status(400).json({ ok: false, msg: 'El nombre y la categoría son obligatorios.' });
    }
    try {
        const nombreLimpio = nombre_producto.trim().toUpperCase();
        const existe = await pool.query('SELECT * FROM insumos WHERE LOWER(TRIM(nombre_producto)) = LOWER(TRIM($1))', [nombreLimpio]);
        if (existe.rows.length > 0) {
            return res.status(400).json({ ok: false, msg: 'Este insumo ya existe in el catálogo.' });
        }

        let prefijo = 'COC';
        if (categoria === 'HORNO') prefijo = 'HOR';
        if (categoria === 'BAR') prefijo = 'BAR';

        const conteoQuery = await pool.query('SELECT COUNT(*) FROM insumos WHERE categoria = $1', [categoria]);
        const siguienteNumero = parseInt(conteoQuery.rows[0].count) + 1;
        const letrasProducto = nombreLimpio.replace(/[^A-Z]/g, '').substring(0, 3).padEnd(3, 'X');
        const codigoAutogenerado = `${prefijo}-${letrasProducto}${String(siguienteNumero).padStart(3, '0')}`;
        
        await pool.query(
            'INSERT INTO insumos (codigo_producto, nombre_producto, categoria, maneja_peso, peso_teorico_kg) VALUES ($1, $2, $3, false, 0.000)', 
            [codigoAutogenerado, nombreLimpio, categoria]
        );
        return res.status(201).json({ ok: true, msg: `✅ Insumo agregado con éxito. Código: ${codigoAutogenerado}` });
    } catch (error) {
        return res.status(500).json({ ok: false, msg: `Error en base de datos: ${error.message}` });
    }
});

// 📥 IMPORTACIÓN MASIVA DE INSUMOS
app.post('/api/insumos/importar', verificarToken, async (req, res) => {
    const { insumos } = req.body;
    if (!insumos || !Array.isArray(insumos) || insumos.length === 0) {
        return res.status(400).json({ ok: false, msg: 'No se enviaron insumos válidos.' });
    }
    try {
        let insertados = 0;
        let omitidos = 0;

        for (const item of insumos) {
            const { nombre_producto, categoria } = item;
            if (!nombre_producto || !categoria) { omitidos++; continue; }

            const nombreLimpio = nombre_producto.trim().toUpperCase();
            const existe = await pool.query('SELECT * FROM insumos WHERE LOWER(TRIM(nombre_producto)) = LOWER(TRIM($1))', [nombreLimpio]);
            if (existe.rows.length > 0) { omitidos++; continue; }

            let prefijo = 'COC';
            if (categoria === 'HORNO') prefijo = 'HOR';
            if (categoria === 'BAR') prefijo = 'BAR';
            
            const conteoQuery = await pool.query('SELECT COUNT(*) FROM insumos WHERE categoria = $1', [categoria]);
            const siguienteNumero = parseInt(conteoQuery.rows[0].count) + 1;
            const letrasProducto = nombreLimpio.replace(/[^A-Z]/g, '').substring(0, 3).padEnd(3, 'X');
            const codigoAutogenerado = `${prefijo}-${letrasProducto}${String(siguienteNumero).padStart(3, '0')}`;
            
            await pool.query(
                'INSERT INTO insumos (codigo_producto, nombre_producto, categoria, maneja_peso, peso_teorico_kg) VALUES ($1, $2, $3, false, 0.000)', 
                [codigoAutogenerado, nombreLimpio, categoria]
            );
            insertados++;
        }
        return res.json({ ok: true, msg: `📥 Importación completada. Insertados: ${insertados}, Omitidos/Duplicados: ${omitidos}` });
    } catch (error) {
        return res.status(500).json({ ok: false, msg: `Error masivo: ${error.message}` });
    }
});

// 📱 REGISTRAR MOVIMIENTOS
app.post('/api/movimientos', verificarToken, async (req, res) => {
    const { 
        id_insumo, tipo_movimiento, cantidad_unidades, cantidad_kilogramos, 
        merma_kilogramos, id_local_origen, id_local_destino, comentario, precio_total, 
        fecha_retroactiva, categoria, id_usuario 
    } = req.body;

    try {
        const fechaOperacion = fecha_retroactiva ? fecha_retroactiva : new Date().toISOString().split('T')[0];
        const estadoInicial = (tipo_movimiento === 'PRÉSTAMO' || tipo_movimiento === 'PRESTAMO') ? 'PENDIENTE' : 'CONFIRMADO';

        const query = `
            INSERT INTO movimientos (
                id_insumo, tipo_movimiento, cantidad_unidades, cantidad_kilogramos, 
                merma_kilogramos, id_local_origen, id_local_destino, comentario, precio_total, 
                categoria, id_usuario, fecha_operacion, estado_traslado
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
            RETURNING *;
        `;

        const values = [
            id_insumo, 
            tipo_movimiento, 
            parseFloat(cantidad_unidades) || 0, 
            parseFloat(cantidad_kilogramos) || 0,
            parseFloat(merma_kilogramos) || 0, 
            parseInt(id_local_origen), 
            id_local_destino ? parseInt(id_local_destino) : null, 
            comentario ? comentario.trim() : '', 
            parseFloat(precio_total) || 0, 
            categoria, 
            parseInt(id_usuario), 
            fechaOperacion, 
            estadoInicial
        ];

        const resultado = await pool.query(query, values);
        res.json({ ok: true, msg: "✅ Operación registrada en el sistema.", movimiento: resultado.rows[0] });
    } catch (e) {
        res.status(500).json({ ok: false, msg: e.message });
    }
});

// 🚚 OBTENER TRASLADOS PENDIENTES
app.get('/api/movimientos/pendientes/:id_local', verificarToken, async (req, res) => {
    const { id_local } = req.params;
    try {
        const query = `
            SELECT 
                m.id_movimiento, m.fecha_operacion, i.nombre_producto as insumo, lo.nombre_local as origen,
                m.cantidad_unidades, m.cantidad_kilogramos, m.categoria
            FROM movimientos m
            JOIN insumos i ON m.id_insumo = i.id_insumo
            JOIN locales lo ON m.id_local_origen = lo.id_local
            WHERE m.id_local_destino = $1 
              AND m.estado_traslado = 'PENDIENTE'
              AND m.tipo_movimiento IN ('PRESTAMO', 'PRÉSTAMO')
            ORDER BY m.id_movimiento DESC;
        `;
        const resultado = await pool.query(query, [parseInt(id_local)]);
        res.json(resultado.rows);
    } catch (e) {
        res.status(500).json({ ok: false, msg: e.message });
    }
});

app.put('/api/movimientos/:id_movimiento/confirmar-traslado', verificarToken, async (req, res) => {
    const { id_movimiento } = req.params;
    const { cantidad_recibida, id_usuario } = req.body;
    try {
        const queryUpdate = `
            UPDATE movimientos 
            SET estado_traslado = 'CONFIRMADO', cantidad_unidades = $1, id_usuario_receptor = $2, fecha_recepcion = NOW()
            WHERE id_movimiento = $3;
        `;
        await pool.query(queryUpdate, [parseFloat(cantidad_recibida), parseInt(id_usuario), parseInt(id_movimiento)]);
        res.json({ ok: true, msg: '✓ Traslado conformado e ingresado al inventario de la sede destino.' });
    } catch (e) {
        res.status(500).json({ ok: false, msg: e.message });
    }
});

// 📋 HISTORIAL GENERAL
app.get('/api/reportes', verificarToken, async (req, res) => {
    const { fecha_inicio, fecha_fin, id_insumo } = req.query;
    let query = `
        SELECT m.id_movimiento AS "Nro", TO_CHAR(m.fecha_registro, 'DD/MM/YYYY HH24:MI') AS "Fecha_Hora",
        u.nombre_completo AS "Encargado", i.nombre_producto AS "Insumo", m.tipo_movimiento AS "Operacion",
        COALESCE(m.categoria, i.categoria) AS "Categoria", lo.nombre_local AS "Origen", 
        CASE WHEN m.tipo_movimiento = 'SALIDA' THEN '-' ELSE COALESCE(ld.nombre_local, '-') END AS "Destino", 
        m.cantidad_unidades AS "Unds", m.cantidad_kilogramos AS "Kilos", m.precio_total AS "Total_Soles",
        m.comentario AS "comentario", m.merma_kilogramos
        FROM movimientos m 
        JOIN usuarios u ON m.id_usuario = u.id_usuario 
        JOIN insumos i ON m.id_insumo = i.id_insumo
        JOIN locales lo ON m.id_local_origen = lo.id_local 
        LEFT JOIN locales ld ON m.id_local_destino = ld.id_local 
        WHERE 1=1`;
    
    const params = [];
    let pIdx = 1;
    
    if (fecha_inicio && fecha_fin) { 
        query += ` AND m.fecha_operacion BETWEEN $${pIdx} AND $${pIdx+1}`; 
        params.push(fecha_inicio, fecha_fin); 
        pIdx += 2; 
    }
    if (id_insumo && id_insumo !== "TODOS") { 
        query += ` AND m.id_insumo = $${pIdx}`; 
        params.push(parseInt(id_insumo)); 
        pIdx++;
    }
    
    query += ` ORDER BY m.id_movimiento DESC`;
    try { 
        const r = await pool.query(query, params); 
        res.json(r.rows); 
    } catch (e) { 
        res.status(500).json({ error: e.message }); 
    }
});

// 📊 MATRIZ STOCK ACTUAL CON MÍNIMOS INDEPENDIENTES POR LOCAL
app.get('/api/stock-actual', verificarToken, async (req, res) => {
    const { fecha_inicio, fecha_hasta, id_insumo } = req.query;
    const params = [];
    let pIdx = 1;
    
    let filtroFechasM = '';
    let filtroFechasSub = '';

    if (fecha_inicio) {
        filtroFechasM += ` AND m.fecha_operacion >= '${fecha_inicio}'`;
        filtroFechasSub += ` AND m_c.fecha_operacion >= '${fecha_inicio}'`;
    }
    if (fecha_hasta) {
        filtroFechasM += ` AND m.fecha_operacion <= '${fecha_hasta}'`;
        filtroFechasSub += ` AND m_c.fecha_operacion <= '${fecha_hasta}'`;
    }

    let query = `
        SELECT 
            i.id_insumo, i.nombre_producto, i.codigo_producto, i.categoria,
            
            -- 🔔 MÍNIMOS INDEPENDIENTES POR LOCAL
            COALESCE((SELECT stock_minimo FROM stock_local WHERE id_local = 1 AND id_insumo = i.id_insumo), 0) AS min_tambo_sebas,
            COALESCE((SELECT stock_minimo FROM stock_local WHERE id_local = 2 AND id_insumo = i.id_insumo), 0) AS min_grandes_hermanos,
            COALESCE((SELECT stock_minimo FROM stock_local WHERE id_local = 3 AND id_insumo = i.id_insumo), 0) AS min_chicken_house,
            COALESCE((SELECT stock_minimo FROM stock_local WHERE id_local = 4 AND id_insumo = i.id_insumo), 0) AS min_country_club,
            
            -- 🏪 1. TAMBO SEBAS
            COALESCE(SUM(CASE WHEN m.id_local_origen = 1 AND m.tipo_movimiento IN ('INGRESO', 'RETORNO') THEN m.cantidad_unidades ELSE 0 END), 0) +
            COALESCE(SUM(CASE WHEN m.id_local_destino = 1 AND m.tipo_movimiento IN ('PRESTAMO', 'DEVOLUCION') AND m.estado_traslado = 'CONFIRMADO' THEN m.cantidad_unidades ELSE 0 END), 0) -
            COALESCE(SUM(CASE WHEN m.id_local_origen = 1 AND m.tipo_movimiento IN ('SALIDA', 'PRESTAMO', 'DEVOLUCION') THEN m.cantidad_unidades ELSE 0 END), 0) AS tambo_sebas_unidades,

            -- 🏪 2. GRANDES HERMANOS
            COALESCE(SUM(CASE WHEN m.id_local_origen = 2 AND m.tipo_movimiento IN ('INGRESO', 'RETORNO') THEN m.cantidad_unidades ELSE 0 END), 0) +
            COALESCE(SUM(CASE WHEN m.id_local_destino = 2 AND m.tipo_movimiento IN ('PRESTAMO', 'DEVOLUCION') AND m.estado_traslado = 'CONFIRMADO' THEN m.cantidad_unidades ELSE 0 END), 0) -
            COALESCE(SUM(CASE WHEN m.id_local_origen = 2 AND m.tipo_movimiento IN ('SALIDA', 'PRESTAMO', 'DEVOLUCION') THEN m.cantidad_unidades ELSE 0 END), 0) AS grandes_hermanos_unidades,

            -- 🏪 3. CHICKEN HOUSE
            COALESCE(SUM(CASE WHEN m.id_local_origen = 3 AND m.tipo_movimiento IN ('INGRESO', 'RETORNO') THEN m.cantidad_unidades ELSE 0 END), 0) +
            COALESCE(SUM(CASE WHEN m.id_local_destino = 3 AND m.tipo_movimiento IN ('PRESTAMO', 'DEVOLUCION') AND m.estado_traslado = 'CONFIRMADO' THEN m.cantidad_unidades ELSE 0 END), 0) -
            COALESCE(SUM(CASE WHEN m.id_local_origen = 3 AND m.tipo_movimiento IN ('SALIDA', 'PRESTAMO', 'DEVOLUCION') THEN m.cantidad_unidades ELSE 0 END), 0) AS chicken_house_unidades,

            -- 🏪 4. COUNTRY CLUB
            COALESCE(SUM(CASE WHEN m.id_local_origen = 4 AND m.tipo_movimiento IN ('INGRESO', 'RETORNO') THEN m.cantidad_unidades ELSE 0 END), 0) +
            COALESCE(SUM(CASE WHEN m.id_local_destino = 4 AND m.tipo_movimiento IN ('PRESTAMO', 'DEVOLUCION') AND m.estado_traslado = 'CONFIRMADO' THEN m.cantidad_unidades ELSE 0 END), 0) -
            COALESCE(SUM(CASE WHEN m.id_local_origen = 4 AND m.tipo_movimiento IN ('SALIDA', 'PRESTAMO', 'DEVOLUCION') THEN m.cantidad_unidades ELSE 0 END), 0) AS country_club_unidades,
         
            -- 💰 COSTO UNITARIO PROMEDIO PONDERADO REAL
            COALESCE((
                SELECT SUM(m_c.precio_total) / NULLIF(SUM(m_c.cantidad_unidades), 0) 
                FROM movimientos m_c 
                WHERE m_c.id_insumo = i.id_insumo AND m_c.tipo_movimiento = 'INGRESO' ${filtroFechasSub}
            ), 0) AS costo_unitario_promedio,

            -- 💵 TOTAL GASTADO EN COMPRAS
            COALESCE((
                SELECT SUM(m_c.precio_total) 
                FROM movimientos m_c 
                WHERE m_c.id_insumo = i.id_insumo AND m_c.tipo_movimiento = 'INGRESO' ${filtroFechasSub}
            ), 0) AS total_compras_valorizado

        FROM insumos i 
        LEFT JOIN movimientos m ON i.id_insumo = m.id_insumo ${filtroFechasM}
        WHERE 1=1
    `;

    if (id_insumo && id_insumo !== "TODOS") { 
        query += ` AND i.id_insumo = $${pIdx}`;
        params.push(parseInt(id_insumo)); 
        pIdx++;
    }
    
    query += ` GROUP BY i.id_insumo, i.nombre_producto, i.codigo_producto, i.categoria ORDER BY i.nombre_producto ASC`;
    try { 
        const r = await pool.query(query, params); 
        res.json(r.rows);
    } catch (e) { 
        res.status(500).json({ error: e.message }); 
    }
});

// 💰 RUTA PARA ACTUALIZAR EL COSTO TOTAL EN CALIENTE DESDE EL HISTORIAL
app.put('/api/movimientos/:id/costo', verificarToken, async (req, res) => {
    const { id } = req.params;
    const { precio_total } = req.body;

    if (precio_total === undefined || isNaN(precio_total)) {
        return res.status(400).json({ ok: false, msg: 'Costo inválido.' });
    }

    try {
        await pool.query(
            'UPDATE movimientos SET precio_total = $1 WHERE id_movimiento = $2', 
            [parseFloat(precio_total), parseInt(id)]
        );
        return res.status(200).json({ ok: true, msg: '💰 Costo asignado y guardado correctamente.' });
    } catch (error) {
        return res.status(500).json({ ok: false, msg: `Error al actualizar costo: ${error.message}` });
    }
});


// =================================================================
// 🏭 MÓDULO LOGÍSTICO: PLANTA DE PRODUCCIÓN Y DESPACHOS TRADICIONALES
// =================================================================

// 1. 🚀 ADMIN: GUARDAR Y ENVIAR ORDEN OFICIAL A PLANTA
app.post('/api/despachos/enviar', verificarToken, async (req, res) => {
    const { id_local_destino, fecha_envio, id_usuario_admin, insumos_pedidos } = req.body;
    const client = await pool.connect();
    
    try {
        await client.query('BEGIN');
        
        const ordenRes = await client.query(
            `INSERT INTO ordenes_despacho (id_local_destino, fecha_envio, id_usuario_admin) 
             VALUES ($1, $2, $3) RETURNING id_orden`,
            [parseInt(id_local_destino), fecha_envio, parseInt(id_usuario_admin)]
        );
        const id_orden = ordenRes.rows[0].id_orden;
        
        for (const item of insumos_pedidos) {
            if (parseFloat(item.cantidad) > 0) {
                await client.query(
                    `INSERT INTO ordenes_despacho_detalle (id_orden, id_insumo, cantidad_aprobada_admin) 
                     VALUES ($1, $2, $3)`,
                    [id_orden, parseInt(item.id_insumo), parseFloat(item.cantidad)]
                );
            }
        }
        
        await client.query('COMMIT');
        res.json({ ok: true, msg: `🚀 Orden #${id_orden} enviada con éxito a la planta de producción.` });
    } catch (e) {
        await client.query('ROLLBACK');
        res.status(500).json({ ok: false, msg: e.message });
    } finally {
        client.release();
    }
});

// 2. 🚚 ENCARGADO / PLANTA: VER PEDIDOS PENDIENTES POR RECIBIR (VERSIÓN UNIFICADA INTELIGENTE)
// 🚚 ENCARGADO / PLANTA / ADMIN: VER PEDIDOS Y COLA CON HISTORIAL VIVO
app.get('/api/despachos/pendientes/:id_local', verificarToken, async (req, res) => {
    const { id_local } = req.params;
    try {
        let query;
        let parametros = [];

        // Si es Planta (Rol 3) o Admin (Rol 1), le mandamos TODO (pendientes y recibidos) para que no se borre nada
        if (req.usuario && (req.usuario.id_rol === 3 || req.usuario.id_rol === 1)) {
            query = `
                SELECT 
                    od.id_orden, 
                    od.fecha_envio, 
                    odd.id_detalle, 
                    i.id_insumo, 
                    i.nombre_producto AS insumo, 
                    i.categoria, 
                    odd.cantidad_aprobada_admin, 
                    l.nombre_local AS origen,
                    od.estado_orden -- Jalamos el estado para pintarlo en el frontend
                FROM ordenes_despacho od
                JOIN ordenes_despacho_detalle odd ON od.id_orden = odd.id_orden
                JOIN insumos i ON odd.id_insumo = i.id_insumo
                JOIN locales l ON od.id_local_destino = l.id_local
                WHERE od.estado_orden IN ('ENVIADO', 'RECIBIDO_COMPLETO', 'RECIBIDO_CON_OBSERVACION')
                ORDER BY od.id_orden DESC; -- Los más recientes primero
            `;
        } else {
            // Si es un encargado normal de tienda, a él sí le mostramos solo lo que viene en camino ('ENVIADO') para que lo reciba
            query = `
                SELECT od.id_orden, od.fecha_envio, odd.id_detalle, i.id_insumo, i.nombre_producto AS insumo, 
                       i.categoria, odd.cantidad_aprobada_admin, l.nombre_local AS origen, od.estado_orden
                FROM ordenes_despacho od
                JOIN ordenes_despacho_detalle odd ON od.id_orden = odd.id_orden
                JOIN insumos i ON odd.id_insumo = i.id_insumo
                JOIN locales l ON od.id_local_destino = l.id_local
                WHERE od.id_local_destino = $1 AND od.estado_orden = 'ENVIADO'
                ORDER BY od.id_orden ASC;
            `;
            parametros.push(parseInt(id_local));
        }

        const resultado = await pool.query(query, parametros);
        res.json(resultado.rows);
    } catch (e) {
        res.status(500).json({ ok: false, msg: e.message });
    }
});

// 3. ✓ ENCARGADO: CONFIRMAR CON CONTEO FÍSICO REAL
app.put('/api/despachos/recibir/:id_orden', verificarToken, async (req, res) => {
    const { id_orden } = req.params;
    const { id_usuario_receptor, items_recibidos } = req.body;
    const client = await pool.connect();
    
    try {
        await client.query('BEGIN');
        let huboDiferencia = false;
        
        for (const item of items_recibidos) {
            const detQuery = await client.query(`SELECT cantidad_aprobada_admin FROM ordenes_despacho_detalle WHERE id_detalle = $1`, [item.id_detalle]);
            const cantAprobada = parseFloat(detQuery.rows[0].cantidad_aprobada_admin);
            const cantReal = parseFloat(item.cantidad_real) || 0;
            
            if (cantReal !== cantAprobada) huboDiferencia = true;
            
            await client.query(
                `UPDATE ordenes_despacho_detalle 
                 SET cantidad_recibida_local = $1, id_usuario_receptor = $2, fecha_recepcion = NOW() 
                 WHERE id_detalle = $3`,
                [cantReal, parseInt(id_usuario_receptor), parseInt(item.id_detalle)]
            );
            
            if (cantReal > 0) {
                const queryMov = `
                    INSERT INTO movimientos (id_insumo, tipo_movimiento, cantidad_unidades, cantidad_kilogramos, 
                                            id_local_origen, comentario, categoria, id_usuario, fecha_operacion, estado_traslado) 
                    VALUES ($1, 'INGRESO', $2, 0, (SELECT id_local_destino FROM ordenes_despacho WHERE id_orden = $3), $4, $5, $6, NOW(), 'CONFIRMADO')`;
                
                const comentarioRecepcion = `🚚 Ingreso por despacho de planta Orden #${id_orden}.`;
                await client.query(queryMov, [parseInt(item.id_insumo), cantReal, parseInt(id_orden), comentarioRecepcion, item.categoria, parseInt(id_usuario_receptor)]);
            }
        }
        
        const estadoFinal = huboDiferencia ? 'RECIBIDO_CON_OBSERVACION' : 'RECIBIDO_COMPLETO';
        await client.query(`UPDATE ordenes_despacho SET estado_orden = $1 WHERE id_orden = $2`, [estadoFinal, parseInt(id_orden)]);
        
        await client.query('COMMIT');
        res.json({ ok: true, msg: `✓ Despacho procesado. Inventario actualizado con el conteo físico real.` });
    } catch (e) {
        await client.query('ROLLBACK');
        res.status(500).json({ ok: false, msg: e.message });
    } finally {
        client.release();
    }
});

app.listen(PORT, () => { console.log(`🚀 Server activo en puerto ${PORT}`); });