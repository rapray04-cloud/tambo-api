import React, { useState, useEffect } from 'react';
import axios from 'axios';

// 🚀 INTERCEPTOR DE AXIOS: Inyecta el token automáticamente en CADA petición al servidor
axios.interceptors.request.use(
  (config) => {
    const token = localStorage.getItem('tambo_token');
    if (token) {
      config.headers['Authorization'] = `Bearer ${token}`;
    }
    return config;
  },
  (error) => {
    return Promise.reject(error);
  }
);
  
// Funciones auxiliares globales de formato y estilos
const formatStockNumber = (val) => {
  const num = parseFloat(val);
  if (isNaN(num)) return "0";
  return num % 1 === 0 ? num.toString() : num.toFixed(2);
};

// Formateador de fechas para evitar desfases o marcas ISO crudas en la tabla visual
const formatearFechaLimpia = (fechaStr) => {
  if (!fechaStr) return '-';
  if (fechaStr.includes('-') && !fechaStr.includes('T')) {
    const [y, m, d] = fechaStr.split('-');
    return `${d}/${m}/${y}`;
  }
  try {
    const d = new Date(fechaStr);
    if (isNaN(d.getTime())) return fechaStr;
    return d.toLocaleDateString('es-PE', { timeZone: 'America/Lima' });
  } catch (e) {
    return fechaStr;
  }
};

const celdaStockStyle = (unidades) => {
  const n = parseFloat(unidades) || 0;
  return {
    padding: '8px 10px',
    textAlign: 'center',
    fontWeight: '700',
    color: n === 0 ? '#94a3b8' : n < 5 ? '#dc2626' : '#0f172a',
    backgroundColor: n === 0 ? '#f8fafc' : n < 5 ? '#fee2e2' : 'transparent',
    border: '1px solid #cbd5e1'
  };
};

const celdaAlertaAdminStyle = (unidades, minLocal, idRol) => {
  const n = parseFloat(unidades) || 0;
  const min = parseFloat(minLocal) || 0;
  
  if (idRol === 1 && min > 0 && n <= min) {
    return {
      padding: '8px 10px',
      textAlign: 'center',
      fontWeight: '800',
      color: '#c2410c', 
      backgroundColor: '#fff7ed', 
      border: '2px solid #f97316' 
    };
  }
  
  return celdaStockStyle(unidades);
};

const styles = {
  input: { padding: '8px 10px', borderRadius: '6px', border: '1px solid #cbd5e1', fontSize: '13px', width: '100%', boxSizing: 'border-box' },
  btnPrimary: { backgroundColor: '#1e3a8a', color: 'white', border: 'none', borderRadius: '8px', fontWeight: '700', cursor: 'pointer', fontSize: '13px' }
};

function App() {
  const [localesEnviadosTmp, setLocalesEnviadosTmp] = useState([]);

  useEffect(() => {
    const token = localStorage.getItem('tambo_token');
    const usuarioGuardado = localStorage.getItem('tambo_user');
    if (token && usuarioGuardado) {
      const userParsed = JSON.parse(usuarioGuardado);
      setUsuarioLogueado(userParsed);
      if (userParsed.id_rol === 3) setTabActiva('panel-planta');
    }
  }, []);

  const [usuarioLogueado, setUsuarioLogueado] = useState(null);
  const [insumosList, setInsumosList] = useState([]);
  const [reportesList, setReportesList] = useState([]);
  const [stockRealList, setStockRealList] = useState([]);
  const [trasladosPendientes, setTrasladosPendientes] = useState([]);
  const [cantidadesRecibidas, setCantidadesRecibidas] = useState({}); 
  
  // 📦 Estados para el Módulo de Despachos Inteligentes a Planta
  const [despachoSugeridoList, setDespachoSugeridoList] = useState([]);
  const [cantidadesAdminDespacho, setCantidadesAdminDespacho] = useState({}); // { "idLocal_idInsumo": cantidad }
  const [fechaEnvioCamion, setFechaEnvioCamion] = useState(new Date().toISOString().split('T')[0]);
  const [despachosPendientesSede, setDespachosPendientesSede] = useState([]);
  const [cantidadesRealesEncargado, setCantidadesRealesEncargado] = useState({}); // { id_detalle: cantidad }

  // 🏭 Estados de Control Operativos exclusivos para la Planta de Producción
  const [filtroSedePlanta, setFiltroSedePlanta] = useState("TODOS");
  const [filtroFechaPlanta, setFiltroFechaPlanta] = useState("");
  const [busquedaInsumoPlanta, setBusquedaInsumoPlanta] = useState("");

  const [tabActiva, setTabActiva] = useState('stock');
  const [busquedaInsumo, setBusquedaInsumo] = useState("");

  const [localSeleccionadoMinimos, setLocalSeleccionadoMinimos] = useState("1");
  const [minimosPorLocalList, setMinimosPorLocalList] = useState([]);

  const [filtros, setFiltros] = useState({
    fecha_inicio: new Date(new Date().setDate(new Date().getDate() - 7)).toISOString().split('T')[0],
    fecha_fin: new Date().toISOString().split('T')[0],
    id_insumo: "TODOS"
  });

  const [fechaInicioStock, setFechaInicioStock] = useState(
    new Date(new Date().setDate(new Date().getDate() - 30)).toISOString().split('T')[0]
  );

  const [filtroSedeHistorial, setFiltroSedeHistorial] = useState("TODOS");
  const [filtroOperacionHistorial, setFiltroOperacionHistorial] = useState("TODOS");

  const [loginForm, setLoginForm] = useState({ nombre_usuario: "", password: "" });
  
  const [nuevoInsumoNombre, setNuevoInsumoNombre] = useState("");
  const [nuevaCategoria, setNuevaCategoria] = useState("COCINA"); 
  
  const [form, setForm] = useState({
    id_insumo: "", tipo_movimiento: "SALIDA", type_mov_encargado: "INGRESO", cantidad_unidades: "", cantidad_kilogramos: "", merma_kilogramos: "", id_local_origen: "1", id_local_destino: "", comentario: "", precio_total: "",
    fecha_retroactiva: new Date().toISOString().split('T')[0], 
    categoria: "COCINA" 
  });

  const [costosEditables, setCostosEditables] = useState({});
  const [minimosEditables, setMinimosEditables] = useState({});
  const [mensaje, setMensaje] = useState("");
  const [errorOperacion, setErrorOperacion] = useState("");
  const [errorLogin, setErrorLogin] = useState("");

  const cambiarTab = (nuevaTab) => {
    setMensaje("");
    setErrorOperacion("");
    setTabActiva(nuevaTab);
  };

  const cargarInsumos = async () => {
    if (!usuarioLogueado) return;
    try { 
      const res = await axios.get('https://tambo-api.onrender.com/api/insumos'); 
      setInsumosList(res.data || []); 
    } catch (err) { console.error(err); }
  };

  const cargarMínimosDelLocal = async (idLocal) => {
    try {
      setMinimosEditables({});
      const res = await axios.get(`https://tambo-api.onrender.com/api/locales/${idLocal}/minimos`);
      setMinimosPorLocalList(res.data || []);
    } catch (err) {
      console.error("Error al cargar mínimos:", err);
    }
  };

  useEffect(() => {
    if (usuarioLogueado && tabActiva === 'config-minimos') {
      cargarMínimosDelLocal(localSeleccionadoMinimos);
    }
  }, [localSeleccionadoMinimos, tabActiva, usuarioLogueado]);

  const cargarDatosAdministrador = async () => {
    if (!usuarioLogueado || (usuarioLogueado.id_rol !== 1 && usuarioLogueado.id_rol !== 3)) return;
    try {
      const { fecha_inicio, fecha_fin, id_insumo } = filtros;
      const [resReportes, resStock] = await Promise.all([
        axios.get(`https://tambo-api.onrender.com/api/reportes?fecha_inicio=${fecha_inicio}&fecha_fin=${fecha_fin}&id_insumo=${id_insumo}`),
        axios.get(`https://tambo-api.onrender.com/api/stock-actual?fecha_inicio=${fechaInicioStock}&fecha_hasta=${fecha_fin}&id_insumo=${id_insumo}`)
      ]);
      setReportesList(resReportes.data || []);
      setStockRealList(resStock.data || []);
    } catch (err) { console.error(err); }
  };

  const calcularSugerenciasDespacho = () => {
    if (!stockRealList || stockRealList.length === 0) return;

    const locales = [
      { id: 1, nombre: "Tambo Sebas", prefijoMin: "min_tambo_sebas", prefijoStock: "tambo_sebas_unidades" },
      { id: 2, nombre: "Grande Hermanos", prefijoMin: "min_grandes_hermanos", prefijoStock: "grandes_hermanos_unidades" },
      { id: 3, nombre: "Chicken House", prefijoMin: "min_chicken_house", prefijoStock: "chicken_house_unidades" },
      { id: 4, nombre: "Country Club", prefijoMin: "min_country_club", prefijoStock: "country_club_unidades" }
    ];

    let sugerencias = [];
    stockRealList.forEach(insumo => {
      locales.forEach(local => {
        const stockMinimo = parseFloat(insumo[local.prefijoMin]) || 0;
        const stockActual = parseFloat(insumo[local.prefijoStock]) || 0;

        if (stockMinimo > 0 && stockActual < stockMinimo) {
          const sugerido = stockMinimo - stockActual;
          sugerencias.push({
            id_local: local.id,
            nombre_local: local.nombre,
            id_insumo: insumo.id_insumo,
            nombre_producto: insumo.nombre_producto,
            codigo_producto: insumo.codigo_producto,
            categoria: insumo.categoria,
            stock_minimo: stockMinimo,
            stock_actual: stockActual,
            cantidad_sugerida: sugerido
          });
        }
      });
    });
    setDespachoSugeridoList(sugerencias);
  };

  useEffect(() => {
    if (tabActiva === 'sugerir-despacho') {
      calcularSugerenciasDespacho();
    }
  }, [stockRealList, tabActiva]);

  const cargarDespachosPlantaGeneral = async () => {
    if (!usuarioLogueado) return;
    try {
      // 🟢 CORRECCIÓN: Usamos 'PLANTA_GLOBAL' en vez de 1 para el Admin/Planta, liberando el ID 1 para Tambo Sebas
      const idSedeQuery = (usuarioLogueado.id_rol === 1 || usuarioLogueado.id_rol === 3) ? 'PLANTA_GLOBAL' : usuarioLogueado.id_local;
      const res = await axios.get(`https://tambo-api.onrender.com/api/despachos/pendientes/${idSedeQuery}`);
      setDespachosPendientesSede(res.data || []);
    } catch (err) {
      console.error("Error cargando la cola de producción:", err);
    }
  };

  useEffect(() => {
    if (usuarioLogueado && (tabActiva === 'panel-planta' || tabActiva === 'sugerir-despacho' || tabActiva === 'stock')) {
      cargarDespachosPlantaGeneral();
    }
  }, [usuarioLogueado, tabActiva]);

  const handleEnviarOrdenPlanta = async (idLocal, nombreLocal) => {
    const insumosDelLocal = despachoSugeridoList.filter(s => s.id_local === idLocal);
    const insumos_pedidos = insumosDelLocal.map(ins => {
      const clave = `${idLocal}_${ins.id_insumo}`;
      const cantidadFinal = cantidadesAdminDespacho[clave] !== undefined ? cantidadesAdminDespacho[clave] : ins.cantidad_sugerida;
      return { id_insumo: ins.id_insumo, cantidad: parseFloat(cantidadFinal) || 0 };
    }).filter(item => item.cantidad > 0);

    if (insumos_pedidos.length === 0) {
      alert(`❌ No hay insumos con cantidades mayores a 0 para enviar a Planta para ${nombreLocal}.`);
      return;
    }

    try {
      const res = await axios.post('https://tambo-api.onrender.com/api/despachos/enviar', {
        id_local_destino: idLocal,
        fecha_envio: fechaEnvioCamion,
        id_usuario_admin: usuarioLogueado.id_usuario,
        insumos_pedidos
      });

      if (res.data.ok) {
        alert(res.data.msg);
        setLocalesEnviadosTmp(prev => [...prev, idLocal]);

        setCantidadesAdminDespacho(prev => {
          const nuevasCantidades = { ...prev };
          insumosDelLocal.forEach(ins => {
            delete nuevasCantidades[`${idLocal}_${ins.id_insumo}`];
          });
          return nuevasCantidades;
        });

        cargarDatosAdministrador();
        cargarDespachosPlantaGeneral();
      }
    } catch (err) {
      alert("Error al enviar la orden a producción.");
    }
  };

  const cargarDatosEncargado = async () => {
    if (!usuarioLogueado || usuarioLogueado.id_rol !== 2) return;
    try {
      const fechaFinHoy = new Date().toISOString().split('T')[0];
      const [resReportes, resStock] = await Promise.all([
        axios.get(`https://tambo-api.onrender.com/api/reportes?fecha_inicio=2000-01-01&fecha_fin=${fechaFinHoy}&id_insumo=TODOS`),
        axios.get(`https://tambo-api.onrender.com/api/stock-actual?fecha_inicio=2000-01-01&fecha_hasta=${fechaFinHoy}&id_insumo=TODOS`)
      ]);
      setStockRealList(resStock.data || []);
      const nombreSede = usuarioLogueado.nombre_local;
      const dataReportes = resReportes.data || [];
      setReportesList(dataReportes.filter(r => r.Origen === nombreSede || r.Destino === nombreSede));
    } catch (err) { console.error(err); }
  };

  const cargarTrasladosPendientes = async () => {
    if (!usuarioLogueado || !usuarioLogueado.id_local) return;
    try {
      const res = await axios.get(`https://tambo-api.onrender.com/api/movimientos/pendientes/${usuarioLogueado.id_local}`);
      setTrasladosPendientes(res.data || []);
    } catch (err) { console.error("Error cargando traslados", err); }
  };

 const handleRecibirDespachoPlanta = async (idOrden) => {
    const itemsDeEstaOrden = despachosPendientesSede.filter(d => d.id_orden === idOrden);
    
    const items_recibidos = itemsDeEstaOrden.map(item => {
      const cantReal = cantidadesRealesEncargado[item.id_detalle];
      return {
        id_detalle: item.id_detalle,
        id_insumo: item.id_insumo,
        cantidad_real: cantReal !== undefined && cantReal !== "" ? parseFloat(cantReal) : null,
        categoria: item.categoria
      };
    });

    const sinLlenar = items_recibidos.some(i => i.cantidad_real === null);
    if (sinLlenar) {
      alert("⚠️ Por seguridad, debes digitar el conteo físico real de todos los insumos de la lista antes de procesar.");
      return;
    }

    if (window.confirm(`¿Confirmar la recepción física de la Orden #${idOrden} con las cantidades digitadas?`)) {
      try {
        const res = await axios.put(`https://tambo-api.onrender.com/api/despachos/recibir/${idOrden}`, {
          id_usuario_receptor: usuarioLogueado.id_usuario,
          items_recibidos
        });

        if (res.data.ok) {
          alert(res.data.msg);
          
          // 🧼 Limpiamos los estados locales antes de recargar para asegurar un borrado absoluto en caché de React
          setCantidadesRealesEncargado({});
          setDespachosPendientesSede(prev => prev.filter(d => d.id_orden !== idOrden));
          
          // Refrescamos la sesión de inmediato
          window.location.reload();
        }
      } catch (err) {
        alert("Error al procesar la recepción del despacho.");
      }
    }
  };
  useEffect(() => {
    if (usuarioLogueado && usuarioLogueado.id_local) {
        cargarTrasladosPendientes();
    }
  }, [usuarioLogueado]);

  useEffect(() => {
    if (usuarioLogueado) {
      cargarInsumos();
      if (usuarioLogueado.id_rol === 1 || usuarioLogueado.id_rol === 3) { 
        cargarDatosAdministrador(); 
      } else {
        cargarDatosEncargado();
        setForm(f => ({ 
          ...f, 
          id_local_origen: usuarioLogueado.id_local.toString(), 
          tipo_movimiento: "INGRESO", 
          type_mov_encargado: "INGRESO", 
          id_local_destino: "", 
          categoria: "COCINA", 
          fecha_retroactiva: new Date().toISOString().split('T')[0] 
        }));
      }
    }
  }, [usuarioLogueado]);

  useEffect(() => {
    if (usuarioLogueado) {
      if (usuarioLogueado.id_rol === 1 || usuarioLogueado.id_rol === 3) { cargarDatosAdministrador(); }
      else if (usuarioLogueado.id_rol === 2) { cargarDatosEncargado(); }
    }
  }, [filtros, fechaInicioStock, usuarioLogueado]);

  const handleLogin = async (e) => {
    e.preventDefault();
    setErrorLogin(""); 
    if (!loginForm.nombre_usuario.trim() || !loginForm.password.trim()) {
      setErrorLogin("❌ Por favor, ingrese usuario y contraseña.");
      return;
    }
    try {
      const res = await axios.post('https://tambo-api.onrender.com/api/login', {
        nombre_usuario: loginForm.nombre_usuario.trim().toLowerCase(),
        password: loginForm.password.trim()
      });
      if (res.data && res.data.ok) { 
        localStorage.setItem('tambo_token', res.data.token);
        localStorage.setItem('tambo_user', JSON.stringify(res.data.user));
        setUsuarioLogueado(res.data.user); 
        setMensaje(""); 
        setErrorOperacion(""); 
        if (res.data.user.id_rol === 3) setTabActiva('panel-planta');
      } else {
        setErrorLogin("❌ Credenciales incorrectas.");
      }
    } catch (error) { 
      setErrorLogin("❌ Usuario o contraseña incorrectos.");
    }
  };

  const handleCerrarSesion = () => {
    localStorage.removeItem('tambo_token');
    localStorage.removeItem('tambo_user');
    setInsumosList([]);
    setReportesList([]);
    setStockRealList([]);
    setLocalesEnviadosTmp([]);
    setLoginForm({ nombre_usuario: "", password: "" });
    setUsuarioLogueado(null);
  };

  const handleInsumoChange = (id) => {
    const insumoSeleccionado = insumosList.find(ins => ins.id_insumo.toString() === id.toString());
    setForm(prev => ({
      ...prev,
      id_insumo: id,
      categoria: insumoSeleccionado ? insumoSeleccionado.categoria : prev.categoria
    }));
  };

  const handleCreateInsumo = async (e) => {
    e.preventDefault();
    setMensaje(""); setErrorOperacion("");
    if (!nuevoInsumoNombre.trim()) return;
    try {
      const res = await axios.post('https://tambo-api.onrender.com/api/insumos', { 
        nombre_producto: nuevoInsumoNombre,
        categoria: nuevaCategoria
      });
      if (res.data.ok) {
        setMensaje(res.data.msg);
        setNuevoInsumoNombre("");
        cargarInsumos();
        if (usuarioLogueado.id_rol === 1) cargarDatosAdministrador();
      }
    } catch (err) {
      setErrorOperacion(err.response?.data?.msg || "Error al crear insumo.");
    }
  };

  const handleConfirmarTraslado = async (id_movimiento, cantEnviada) => {
    const cantidadReal = cantidadesRecibidas[id_movimiento] ?? cantEnviada;

    if (window.confirm(`¿Confirmar la recepción de ${cantidadReal} unidades?`)) {
        try {
            const res = await axios.put(`https://tambo-api.onrender.com/api/movimientos/${id_movimiento}/confirmar-traslado`, {
                cantidad_recibida: parseFloat(cantidadReal),
                id_usuario: usuarioLogueado.id_usuario
            });
            
            if (res.data && res.data.ok) {
                alert(res.data.msg);
                setCantidadesRecibidas(prev => { const n = {...prev}; delete n[id_movimiento]; return n; });
                cargarTrasladosPendientes(); 
                if (usuarioLogueado.id_rol === 1) cargarDatosAdministrador(); else cargarDatosEncargado(); 
            } else {
                alert(res.data.msg || "Error al procesar.");
            }
        } catch (err) {
            console.error(err);
            alert("Error al procesar la confirmación.");
        }
    }
  };

  const handleImportarInsumosCSV = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = async (evt) => {
      try {
        const text = evt.target.result;
        const lineas = text.split(/\r?\n/);
        const insumosProcesados = [];
        for (let i = 1; i < lineas.length; i++) {
          if (!lineas[i].trim()) continue;
          const columnas = lineas[i].split(/[,;]/);
          if (columnas.length >= 3) {
            const nombre = columnas[2]?.replace(/["']/g, "").trim();
            const area = columnas[3]?.replace(/["']/g, "").trim().toUpperCase();
            if (nombre && area) {
              insumosProcesados.push({ nombre_producto: nombre, categoria: area });
            }
          }
        }
        if (insumosProcesados.length === 0) {
          setErrorOperacion("No se encontraron filas válidas en el archivo CSV.");
          return;
        }
        const res = await axios.post('https://tambo-api.onrender.com/api/insumos/importar', { insumos: insumosProcesados });
        if (res.data.ok) {
          setMensaje(res.data.msg);
          cargarInsumos();
          if (usuarioLogueado.id_rol === 1) cargarDatosAdministrador();
        }
      } catch (err) { setErrorOperacion("Error al archivo CSV."); }
    };
    reader.readAsText(file, "UTF-8");
  };

  const exportarCatalogoExcel = () => {
    let filas = insumosList.map(ins => `<tr><td style="border: 1px solid #cbd5e1; text-align: center;">${ins.id_insumo}</td><td style="border: 1px solid #cbd5e1; font-weight: bold; color: #1e3a8a;">${ins.codigo_producto}</td><td style="border: 1px solid #cbd5e1; font-weight: bold;">${ins.nombre_producto}</td><td style="border: 1px solid #cbd5e1; text-align: center;">${ins.categoria}</td></tr>`).join('');
    const xml = `<html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:x="urn:schemas-microsoft-com:office:excel" xmlns="http://www.w3.org/TR/REC-html40"><head><meta charset="utf-8"/><style>th { background-color: #1e3a8a; color: white; font-weight: bold; border: 1px solid #cbd5e1; text-align: center; height: 30px; }</style></head><body><h2>📋 MAESTRO CONSOLIDADO DE INSUMOS INTERNOS</h2><table><thead><tr><th>ID</th><th>Código Producto</th><th>Nombre Insumo</th><th>Área Asignada</th></tr></thead><tbody>${filas}</tbody></table></body></html>`;
    const blob = new Blob([xml], { type: 'application/vnd.ms-excel;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = `Maestro_Catalogo_Insumos.xls`; document.body.appendChild(a); a.click(); document.body.removeChild(a);
  };

  const handleSubmitMovimiento = async (e) => {
    e.preventDefault();
    setMensaje(""); setErrorOperacion("");
    if (!form.id_insumo) { setErrorOperacion("❌ Por favor, selecciona un insumo de la lista."); return; }

    const cantUnidades = parseFloat(form.cantidad_unidades) || 0;
    const cantKilos = parseFloat(form.cantidad_kilogramos) || 0;
    const cantMerma = parseFloat(form.merma_kilogramos) || 0;
    
    let tipoMov = usuarioLogueado.id_rol === 2 ? form.type_mov_encargado : form.tipo_movimiento;
    if (tipoMov === "PRÉSTAMO") tipoMov = "PRESTAMO";
    if (tipoMov === "DEVOLUCIÓN") tipoMov = "DEVOLUCION";

    if (usuarioLogueado.id_rol === 2 && (tipoMov === "PRESTAMO" || tipoMov === "DEVOLUCION") && !form.id_local_destino) {
      setErrorOperacion(`❌ Debe seleccionar la Sede de destino para registrar un ${tipoMov}.`);
      return;
    }

    if (tipoMov === "SALIDA" || tipoMov === "PRESTAMO") {
      const insumoSeleccionado = insumosList.find(i => i.id_insumo.toString() === form.id_insumo.toString());
      const nombreInsumo = insumoSeleccionado ? insumoSeleccionado.nombre_producto : "";
      const stockActualFila = stockRealList.find(s => s.nombre_producto === nombreInsumo);
      
      if (stockActualFila) {
        let stockDisponibleUnidades = 0;
        if (form.id_local_origen === "1") stockDisponibleUnidades = parseFloat(stockActualFila.tambo_sebas_unidades) || 0;
        else if (form.id_local_origen === "2") stockDisponibleUnidades = parseFloat(stockActualFila.grandes_hermanos_unidades) || 0;
        else if (form.id_local_origen === "3") stockDisponibleUnidades = parseFloat(stockActualFila.chicken_house_unidades) || 0;
        else if (form.id_local_origen === "4") stockDisponibleUnidades = parseFloat(stockActualFila.country_club_unidades) || 0;

        if (cantUnidades > stockDisponibleUnidades && !insumoSeleccionado?.maneja_peso) {
          setErrorOperacion(`❌ Error Operativo: Stock insuficiente en esta sede. Stock actual disponible: ${stockDisponibleUnidades} unidades.`);
          return;
        }
      } else {
        setErrorOperacion("❌ Error: El insumo seleccionado no registra stock base.");
        return;
      }
    }

    try {
      const datosEnviar = {
        id_insumo: parseInt(form.id_insumo),
        tipo_movimiento: tipoMov, 
        cantidad_unidades: cantUnidades,
        cantidad_kilogramos: cantKilos,
        merma_kilogramos: cantMerma, 
        id_local_origen: parseInt(form.id_local_origen),
        id_local_destino: (tipoMov === "PRESTAMO" || tipoMov === "DEVOLUCION") ? parseInt(form.id_local_destino) : null,
        comentario: form.comentario.trim(),
        categoria: form.categoria, 
        id_usuario: usuarioLogueado.id_usuario,
        precio_total: tipoMov === "INGRESO" ? (parseFloat(form.precio_total) || 0) : 0,
        fecha_retroactiva: form.fecha_retroactiva
      };
      
      const res = await axios.post('https://tambo-api.onrender.com/api/movimientos', datosEnviar);
      if (res.data.ok) {
        setMensaje(`✅ ¡Movimiento registrado con éxito!`);
        setForm({ 
          id_insumo: "", tipo_movimiento: "SALIDA", type_mov_encargado: "INGRESO", cantidad_unidades: "", cantidad_kilogramos: "", merma_kilogramos: "", comentario: "", id_local_destino: "", precio_total: "", 
          id_local_origen: usuarioLogueado.id_local.toString(),
          fecha_retroactiva: new Date().toISOString().split('T')[0],
          categoria: "COCINA"
        });
        if (usuarioLogueado.id_rol === 1) cargarDatosAdministrador(); else cargarDatosEncargado();
      }
    } catch (error) { setErrorOperacion("Error al registrar el movimiento."); }
  };

  const ejecutarGuardadoCosto = async (idMovimiento) => {
    const costo = costosEditables[idMovimiento];
    if (costo === undefined || costo === "") return;
    try {
      const res = await axios.put(`https://tambo-api.onrender.com/api/movimientos/${idMovimiento}/costo`, { precio_total: parseFloat(costo) });
      if (res.data.ok) { 
        setMensaje("💰 Costo asignado con éxito."); 
        if (usuarioLogueado.id_rol === 1) cargarDatosAdministrador(); else cargarDatosEncargado();
      }
    } catch (err) { setErrorOperacion("Error al actualizar el costo."); }
  };

  const ejecutarGuardadoMinimoPorLocal = async (idInsumo) => {
    const minimo = minimosEditables[idInsumo];
    if (minimo === undefined || minimo === "" || isNaN(minimo)) return;
    
    try {
      const res = await axios.put(`https://tambo-api.onrender.com/api/locales/${localSeleccionadoMinimos}/insumos/${idInsumo}/stock-minimo`, { 
        stock_minimo: parseFloat(minimo) 
      });
      
      if (res.data.ok) { 
        setMensaje("🔔 Par Stock del local actualizado con éxito."); 
        cargarMínimosDelLocal(localSeleccionadoMinimos);
        cargarDatosAdministrador(); 
      }
    } catch (err) { 
      setErrorOperacion("Error al actualizar el stock mínimo del local."); 
    }
  };

  const handleKeyDownCosto = (e, idMovimiento) => { if (e.key === 'Enter') { ejecutarGuardadoCosto(idMovimiento); } };

  const reportesFiltrados = (reportesList || []).filter(rep => {
    const origenSede = rep.Origen || rep.nombre_local || "";
    const operacionTipo = rep.Operacion || rep.tipo_movimiento || "";
    const cumpleSede = usuarioLogueado?.id_rol === 2 ? true : (filtroSedeHistorial === "TODOS" || origenSede === filtroSedeHistorial);
    
    let opFiltro = filtroOperacionHistorial;
    if (opFiltro === "PRÉSTAMO") opFiltro = "PRESTAMO";
    if (opFiltro === "DEVOLUCIÓN") opFiltro = "DEVOLUCION";

    const cumpleOperacion = opFiltro === "TODOS" || operacionTipo === opFiltro;
    return cumpleSede && cumpleOperacion;
  });

  const stockRealFiltrado = (stockRealList || []).filter(stk => 
    stk.nombre_producto?.toLowerCase().includes(busquedaInsumo.toLowerCase())
  );

  const ordenesPlantaFiltradas = despachosPendientesSede.filter(ord => {
    const cumpleInsumo = ord.insumo?.toLowerCase().includes(busquedaInsumoPlanta.toLowerCase());
    const cumpleSede = filtroSedePlanta === "TODOS" || ord.origen === filtroSedePlanta;
    const fechaOrdenLimpia = ord.fecha_envio ? ord.fecha_envio.split('T')[0] : '';
    const cumpleFecha = !filtroFechaPlanta || fechaOrdenLimpia === filtroFechaPlanta;
    return cumpleInsumo && cumpleSede && cumpleFecha;
  });

  const exportarExcelCompleto = () => {
    if (usuarioLogueado?.id_rol !== 1) return;
    let totalTambo = 0; let totalGrandes = 0; let totalChicken = 0; let totalCountry = 0; let totalCorp = 0;
    
    let filasMatriz = stockRealFiltrado.map(stk => {
      const cost = Number(stk.costo_unitario_promedio) || 0;
      const uS1 = Number(stk.tambo_sebas_unidades) || 0; 
      const uS2 = Number(stk.grandes_hermanos_unidades) || 0;
      const uS3 = Number(stk.chicken_house_unidades) || 0; 
      const uS4 = Number(stk.country_club_unidades) || 0;

      const valorFila = (uS1 + uS2 + uS3 + uS4) * cost;
      
      totalTambo += valorFila; 
      totalCorp += valorFila;
      return `<tr><td style="border: 1px solid #cbd5e1; font-weight: bold; background-color: #f8fafc;">${stk.nombre_producto}</td><td style="border: 1px solid #cbd5e1; text-align: center;">${uS1}</td><td style="border: 1px solid #cbd5e1; text-align: center;">${uS2}</td><td style="border: 1px solid #cbd5e1; text-align: center;">${uS3}</td><td style="border: 1px solid #cbd5e1; text-align: center;">${uS4}</td><td style="border: 1px solid #cbd5e1; text-align: right; background-color: #f0fdfa; font-weight: bold; color: #0d9488;">S/ ${valorFila.toFixed(2)}</td></tr>`;
    }).join('');
    
    let filasHistorial = reportesFiltrados.map(rep => {
     const total = parseFloat(rep.Total_Soles || rep.total_soles) || 0;
                    const txtComentario = rep.comentario || rep.Comentario || '';
                    const uP = parseFloat(rep.Unds || rep.cantidad_unidades) || 0;
                    let kP = parseFloat(rep.Kilos || rep.cantidad_kilogramos) || 0;
                    
                    // ⚖️ CÁLCULO DE RESCATE: Si los kilos históricos están en 0 pero hay unidades, intentamos buscar el peso unitario promedio
                    if (kP === 0 && uP > 0) {
                      const insumoMatriz = stockRealList.find(s => s.nombre_producto === nombreInsumo);
                      const pesoTeorico = insumoMatriz ? parseFloat(insumoMatriz.peso_teorico_kg) : 0;
                      if (pesoTeorico > 0) {
                        kP = uP * pesoTeorico;
                      }
                    }
                    
                    const mKilos = rep.merma_kilogramos || rep.Merma_Kilos;
                    const mP = mKilos ? parseFloat(mKilos) : 0; 

                    const costoUnitarioCalculado = op === "INGRESO" && uP > 0 ? `S/ ${(total / uP).toFixed(2)}` : "-";
                    const costoKgCalculado = op === "INGRESO" && kP > 0 ? `S/ ${(total / kP).toFixed(2)}` : "-";
      
      const clrOp = op === 'INGRESO' ? 'color: #15803d; background-color: #dcfce7;' : 
                    op === 'RETORNO' ? 'color: #b91c1c; background-color: #fee2e2;' : 
                    'color: #1e293b; background-color: #f1f5f9;';
      
      return `<tr>
        <td style="border: 1px solid #cbd5e1; text-align: center;">${idMov}</td>
        <td style="border: 1px solid #cbd5e1; text-align: center; font-weight: bold;">${rep.Fecha_Hora || rep.fecha_registro || '-'}</td>
        <td style="border: 1px solid #cbd5e1; font-weight: bold; color: #1e3a8a;">${rep.Origen || rep.nombre_local}</td>
        <td style="border: 1px solid #cbd5e1; text-align: center; font-weight: bold; ${clrOp}">${op}</td>
        <td style="border: 1px solid #cbd5e1; text-align: center;">${area}</td>
        <td style="border: 1px solid #cbd5e1; font-weight: bold;">${rep.Insumo || rep.nombre_producto}</td>
        <td style="border: 1px solid #cbd5e1; text-align: right;">${uP}</td>
        <td style="border: 1px solid #cbd5e1; text-align: right;">${kP.toFixed(3)}</td>
        <td style="border: 1px solid #cbd5e1; text-align: center;">${rep.Destino || '-'}</td>
        <td style="border: 1px solid #cbd5e1; text-align: right; font-weight: bold; ${mP > 0 ? 'color: #ef4444;' : 'color: #475569;'}">${mP > 0 ? mP.toFixed(3) : '-'}</td>
        <td style="border: 1px solid #cbd5e1; text-align: center; color: #0d9488;">${costoUnitarioCalculado}</td>
        <td style="border: 1px solid #cbd5e1; text-align: center; color: #b45309;">${costoKgCalculado}</td>
        <td style="border: 1px solid #cbd5e1; text-align: right; font-weight: bold; background-color: #f0fdfa; color: #0d9488;">S/ ${total.toFixed(2)}</td>
        <td style="border: 1px solid #cbd5e1; color: #475569; font-size: 11px;">${txtComentario}</td>
        <td>${rep.Encargado || rep.nombre_completo}</td>
      </tr>`;
    }).join('');

    const xml = `
    <html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:x="urn:schemas-microsoft-com:office:excel" xmlns="http://www.w3.org/TR/REC-html40">
      <head><meta charset="utf-8"/><style>th { background-color: #1e3a8a; color: white; font-weight: bold; border: 1px solid #cbd5e1; text-align: center; height: 32px; font-size: 11px; }</style></head>
      <body>
        <h2>📊 INVENTARIO MAESTRO VALORIZADO</h2>
        <h3>📅 PERIODO DE CONTROL: DESDE ${fechaInicioStock} HASTA ${filtros.fecha_fin}</h3>
        <table><thead><tr><th>Insumo Maestro</th><th>Tambo Sebas</th><th>Grandes Hermanos</th><th>Chicken House</th><th>Country Club</th><th style="background-color: #0d9488;">VALOR CONSOLIDADO</th></tr></thead><tbody>${filasMatriz}<tr style="font-weight: bold; background-color: #e2e8f0;"><td style="border: 1px solid #cbd5e1;">💰 TOTALES:</td><td style="border: 1px solid #cbd5e1; text-align: center;">S/ ${totalTambo.toFixed(2)}</td><td style="border: 1px solid #cbd5e1; text-align: center;">S/ ${totalGrandes.toFixed(2)}</td><td style="border: 1px solid #cbd5e1; text-align: center;">S/ ${totalChicken.toFixed(2)}</td><td style="border: 1px solid #cbd5e1; text-align: center;">S/ ${totalCountry.toFixed(2)}</td><td style="border: 1px solid #0d9488; color: white; background-color:#0d9488;">S/ ${totalCorp.toFixed(2)}</td></tr></tbody></table>
        <br/><h2>📜 HISTORIAL DE AUDITORÍA</h2>
        <table><thead><tr><th>Nro</th><th>Fecha</th><th>Origen</th><th>Operación</th><th>Área</th><th>Insumo</th><th>Unds</th><th>Kilos</th><th>Destino</th><th style="background-color: #ef4444; color: white;">Merma (Kg)</th><th>Costo Und</th><th>Costo Kg</th><th>Costo Total</th><th>Comentario</th><th>Encargado</th></tr></thead><tbody>${filasHistorial}</tbody></table>
      </body>
    </html>`;
    const blob = new Blob([xml], { type: 'application/vnd.ms-excel;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a'); a.href = url; a.download = `Inventario_Desde_${fechaInicioStock}_Hasta_${filtros.fecha_fin}.xls`; document.body.appendChild(a); a.click(); document.body.removeChild(a);
  };

  const exportarExcelPlanta = () => {
    let filas = ordenesPlantaFiltradas.map(ord => {
      const fechaDespachoFormato = ord.fecha_envio ? ord.fecha_envio.split('T')[0] : '';
      const txtEstado = ord.estado_orden === 'ENVIADO' ? 'En Camino' : 'Entregado';
      return `<tr>
        <td style="border: 1px solid #cbd5e1; text-align: center;">${new Date().toLocaleDateString()}</td>
        <td style="border: 1px solid #cbd5e1; text-align: center; font-weight: bold; color: #b45309;">${fechaDespachoFormato}</td>
        <td style="border: 1px solid #cbd5e1; font-weight: bold; color: #1e3a8a;">${ord.origen || 'Tambo Sebas'}</td>
        <td style="border: 1px solid #cbd5e1; font-weight: bold;">${ord.insumo}</td>
        <td style="border: 1px solid #cbd5e1; text-align: center;">${ord.categoria}</td>
        <td style="border: 1px solid #cbd5e1; text-align: right; font-weight: bold;">${ord.cantidad_aprobada_admin}</td>
        <td style="border: 1px solid #cbd5e1; text-align: center; font-weight: bold;">${txtEstado}</td>
      </tr>`;
    }).join('');
  
    const xml = `
    <html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:x="urn:schemas-microsoft-com:office:excel" xmlns="http://www.w3.org/TR/REC-html40">
      <head><meta charset="utf-8"/><style>th { background-color: #1e3a8a; color: white; font-weight: bold; border: 1px solid #cbd5e1; text-align: center; height: 30px; }</style></head>
      <body>
        <h2>📋 PROGRAMA CONSOLIDADO DE PRODUCCIÓN Y HISTORIAL DE DESPACHOS</h2>
        <table>
          <thead>
            <tr>
              <th>Fecha Pedido</th>
              <th>Fecha Despacho (Entrega)</th>
              <th>Sede Destino</th>
              <th>Insumo</th>
              <th>Área Asignada</th>
              <th>Unidades Aprobadas</th>
              <th>Estado</th>
            </tr>
          </thead>
          <tbody>${filas}</tbody>
        </table>
      </body>
    </html>`;
  
    const blob = new Blob([xml], { type: 'application/vnd.ms-excel;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `Resumen_Produccion_Historial.xls`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  };

  const sidebarBtnStyle = (tab) => ({
    width: '100%', padding: '10px 12px', textAlign: 'left', backgroundColor: tabActiva === tab ? '#f1f5f9' : 'transparent', color: tabActiva === tab ? '#1e3a8a' : '#475569', border: 'none', borderRadius: '8px', fontWeight: '700', fontSize: '13px', cursor: 'pointer', marginBottom: '5px'
  });

  if (!usuarioLogueado) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100vh', backgroundColor: '#f1f5f9', fontFamily: '"Segoe UI", sans-serif' }}>
        <form onSubmit={handleLogin} style={{ backgroundColor: '#ffffff', padding: '30px', borderRadius: '12px', boxShadow: '0 4px 10px rgba(0,0,0,0.05)', width: '100%', maxWidth: '360px', boxSizing: 'border-box' }}>
          <h2 style={{ margin: '0 0 5px 0', color: '#1e3a8a', textAlign: 'center', fontSize: '20px', fontWeight: 'bold' }}>SISTEMA TAMBO II</h2>
          <p style={{ margin: '0 0 20px 0', color: '#64748b', textAlign: 'center', fontSize: '13px' }}>Control de Insumos Centralizado</p>
          {errorLogin && <div style={{ padding: '8px', backgroundColor: '#fee2e2', color: '#991b1b', borderRadius: '6px', fontSize: '12px', marginBottom: '10px', textAlign: 'center', fontWeight: 'bold' }}>{errorLogin}</div>}
          <div style={{ marginBottom: '12px' }}>
            <label style={{ fontSize: '12px', fontWeight: 'bold', color: '#475569' }}>Usuario:</label>
            <input type="text" value={loginForm.nombre_usuario} onChange={(e) => setLoginForm({ ...loginForm, nombre_usuario: e.target.value })} style={styles.input} placeholder="Ej: renzo, planta" required />
          </div>
          <div style={{ marginBottom: '20px' }}>
            <label style={{ fontSize: '12px', fontWeight: 'bold', color: '#475569' }}>Contraseña:</label>
            <input type="password" value={loginForm.password} onChange={(e) => setLoginForm({ ...loginForm, password: e.target.value })} style={styles.input} placeholder="••••••••" required />
          </div>
          <button type="submit" style={{ ...styles.btnPrimary, width: '100%', padding: '10px', fontSize: '14px' }}>Ingresar al Sistema 🚀</button>
        </form>
      </div>
    );
  }

  return (
    <div className="dashboard-container" style={{ display: 'flex', fontFamily: '"Segoe UI", sans-serif', backgroundColor: '#f1f5f9', minHeight: '100vh', width: '100%' }}>
      
      {/* 📱 SOPORTE COMPLETO RESPONSIVE PARA SMARTPHONES, TABLETS Y CONTROL DE PANTALLA STICKY */}
      <style>{`
        @media print {
          .sidebar-panel, .filter-row-ui { display: none !important; }
          .dashboard-container { display: block !important; background-color: #fff !important; }
          .table-scroll-box { max-height: none !important; overflow: visible !important; }
          table { width: 100% !important; min-width: 0 !important; border-collapse: collapse !important; }
          th, td { font-size: 10px !important; padding: 5px !important; border: 1px solid #cbd5e1 !important; }
          thead { display: table-header-group !important; position: static !important; }
        }

        @media (min-width: 769px) {
          /* En escritorio fijamos el sidebar para que el botón de cerrar sesión no se vaya abajo jamás */
          .sidebar-panel {
            position: sticky !important;
            top: 0;
            height: 100vh !important;
          }
        }

        @media (max-width: 768px) {
          body { background-color: #f8fafc !important; }
          .dashboard-container { flex-direction: column !important; }
          .sidebar-panel {
            width: 100% !important; border-right: none !important;
            background: linear-gradient(135deg, #1e3a8a 0%, #0f172a 100%) !important;
            color: white !important; padding: 16px !important;
            border-bottom-left-radius: 20px; border-bottom-right-radius: 20px;
            box-shadow: 0 4px 12px rgba(0, 0, 0, 0.1) !important;
            position: relative !important;
            height: auto !important;
          }
          .sidebar-panel h3 { color: #ffffff !important; font-size: 16px !important; letter-spacing: 0.5px; }
          .sidebar-panel span { color: #93c5fd !important; }
          .sidebar-menu-box {
            display: flex !important; flex-direction: row !important; overflow-x: auto !important;
            white-space: nowrap !important; gap: 10px !important; padding: 8px 0 4px 0 !important; scrollbar-width: none;
          }
          .sidebar-menu-box::-webkit-scrollbar { display: none; }
          .sidebar-btn-responsive {
            width: auto !important; background-color: rgba(255, 255, 255, 0.15) !important;
            color: white !important; border: 1px solid rgba(255, 255, 255, 0.25) !important;
            border-radius: 20px !important; padding: 8px 16px !important; font-size: 12px !important; font-weight: 600 !important; transition: all 0.2s ease;
          }
          .sidebar-btn-responsive[style*="background-color: rgb(241, 245, 249)"],
          .sidebar-btn-responsive[style*="background-color: #f1f5f9"] {
            background-color: #ffffff !important; color: #1e3a8a !important; box-shadow: 0 2px 6px rgba(0,0,0,0.1) !important;
          }
          .btn-logout-responsive {
            position: absolute !important; top: 16px !important; right: 16px !important; width: auto !important;
            padding: 6px 12px !important; font-size: 11px !important; border-radius: 12px !important; background-color: #ef4444 !important; color: white !important;
          }
          .content-layout { padding: 12px !important; }
          .dashboard-row, .charts-row { flex-direction: column !important; gap: 12px !important; }
          input[placeholder*="Buscar"] { width: 100% !important; margin-left: 0 !important; margin-top: 8px !important; }
          .table-scroll-box {
            overflow-x: auto !important; overflow-y: auto !important; max-height: 400px !important; -webkit-overflow-scrolling: touch; border: 1px solid #cbd5e1 !important; border-radius: 8px !important;
          }
          table { min-width: 100% !important; font-size: 11px !important; }
          th, td { padding: 8px 6px !important; white-space: normal !important; }
        }
      `}</style>

      {/* SIDEBAR PANEL */}
      <div className="sidebar-panel" style={{ width: '240px', backgroundColor: '#ffffff', borderRight: '1px solid #e2e8f0', padding: '20px 15px', display: 'flex', flexDirection: 'column', flexShrink: 0, boxSizing: 'border-box' }}>
        <div style={{ paddingBottom: '15px', marginBottom: '20px', borderBottom: '2px solid #f1f5f9' }}>
          <h3 style={{ margin: '0', color: '#0f172a', fontSize: '15px', fontWeight: '700' }}>INSUMOS TAMBO II</h3>
          <span style={{ fontSize: '11px', color: '#64748b', fontWeight: '600' }}>
            {usuarioLogueado.id_rol === 1 ? '⚙️ Administrador' : usuarioLogueado.id_rol === 3 ? '🏭 Planta Producción' : `🏪 Encargado: ${usuarioLogueado.nombre_local}`}
          </span>
        </div>
        
        <div className="sidebar-menu-box" style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
          {usuarioLogueado.id_rol === 1 && (
            <button className="sidebar-btn-responsive" onClick={() => cambiarTab('dashboard')} style={sidebarBtnStyle('dashboard')}>📈 Dashboard </button>
          )}
          {usuarioLogueado.id_rol !== 3 && (
            <button className="sidebar-btn-responsive" onClick={() => cambiarTab('stock')} style={sidebarBtnStyle('stock')}>📊 Matriz de Stock</button>
          )}

          {usuarioLogueado.id_rol === 1 && (
            <button className="sidebar-btn-responsive" onClick={() => cambiarTab('sugerir-despacho')} style={sidebarBtnStyle('sugerir-despacho')}>📋 Sugerir Despacho</button>
          )}

          {(usuarioLogueado.id_rol === 1 || usuarioLogueado.id_rol === 3) && (
            <button className="sidebar-btn-responsive" onClick={() => cambiarTab('panel-planta')} style={sidebarBtnStyle('panel-planta')}>🏭 Panel de Planta</button>
          )}
          
          {usuarioLogueado.id_rol === 1 && (
            <button className="sidebar-btn-responsive" onClick={() => cambiarTab('config-minimos')} style={sidebarBtnStyle('config-minimos')}>⚙️ Configurar Mínimos</button>
          )}
          
          {usuarioLogueado.id_rol === 1 && (
            <button className="sidebar-btn-responsive" onClick={() => cambiarTab('insumos')} style={sidebarBtnStyle('insumos')}>🧱 Catálogo Insumos</button>
          )}
          {usuarioLogueado.id_rol !== 3 && (
            <button className="sidebar-btn-responsive" onClick={() => cambiarTab('operaciones')} style={sidebarBtnStyle('operaciones')}>📝 Registrar Movimiento</button>
          )}
          {usuarioLogueado.id_rol !== 3 && (
            <button className="sidebar-btn-responsive" onClick={() => cambiarTab('historial')} style={sidebarBtnStyle('historial')}>📜 Historial Completo</button>
          )}
        </div>
        
        <button className="btn-logout-responsive" onClick={handleCerrarSesion} style={{ width: '100%', padding: '10px', backgroundColor: '#fee2e2', color: '#991b1b', border: 'none', borderRadius: '8px', fontWeight: '700', cursor: 'pointer', marginTop: '10px' }}>Cerrar Sesión</button>
      </div>

      <div className="content-layout" style={{ flex: 1, padding: '15px 20px', boxSizing: 'border-box', display: 'flex', flexDirection: 'column', minWidth: '0' }}>
        {mensaje && <div style={{ padding: '8px 12px', backgroundColor: '#ecfdf5', color: '#065f46', borderRadius: '6px', fontSize: '12px', fontWeight: '600', marginBottom: '12px', width: 'max-content' }}>{mensaje}</div>}
        {errorOperacion && <div style={{ padding: '8px 12px', backgroundColor: '#fee2e2', color: '#991b1b', borderRadius: '6px', fontSize: '12px', fontWeight: '600', marginBottom: '12px', width: 'max-content' }}>{errorOperacion}</div>}

        {/* 📈 TAB: DASHBOARD ANALÍTICO */}
        {tabActiva === 'dashboard' && usuarioLogueado.id_rol === 1 && (() => {
          const totalSalidasEfectuadas = reportesList.filter(r => r.Operacion === 'SALIDA').length;
          const totalIngresosEfectuados = reportesList.filter(r => r.Operacion === 'INGRESO').length;
          const totalKilosMerma = reportesList.reduce((acc, r) => acc + (parseFloat(r.merma_kilogramos || r.Merma_Kilos || 0)), 0);

          const conteoInsumos = {};
          reportesList.filter(r => r.Operacion === 'SALIDA').forEach(r => {
            const nombre = r.Insumo || r.nombre_producto || 'Desconocido';
            const unds = parseFloat(r.Unds || r.cantidad_unidades || 0);
            conteoInsumos[nombre] = (conteoInsumos[nombre] || 0) + unds;
          });

          const topInsumos = Object.entries(conteoInsumos).sort((a, b) => b[1] - a[1]).slice(0, 5);
          const maxConsumo = topInsumos[0] ? topInsumos[0][1] : 1;

          const mermasPorSede = { "Tambo Sebas": 0, "Grande Hermanos": 0, "Chicken House": 0, "Country Club": 0 };
          reportesList.forEach(r => {
            const sede = r.Origen || r.nombre_local;
            const mK = parseFloat(r.merma_kilogramos || r.Merma_Kilos || 0);
            if (mermasPorSede[sede] !== undefined) { mermasPorSede[sede] += mK; }
          });

          const maxMermaSede = Math.max(...Object.values(mermasPorSede), 1);

          return (
            <div className="charts-row" style={{ display: 'flex', flexDirection: 'column', gap: '20px', width: '100%', boxSizing: 'border-box' }}>
              <div className="dashboard-row" style={{ display: 'flex', gap: '15px', flexWrap: 'wrap' }}>
                <div className="card-indicador" style={{ flex: 1, minWidth: '180px', backgroundColor: '#ffffff', borderRadius: '12px', padding: '15px', boxShadow: '0 4px 6px rgba(0,0,0,0.01)', borderLeft: '4px solid #1e3a8a' }}>
                  <span style={{ fontSize: '11px', color: '#64748b', fontWeight: 'bold', display: 'block' }}>📦 DESPACHOS DE SALIDA</span>
                  <strong style={{ fontSize: '24px', color: '#1e3a8a', display: 'block', marginTop: '5px' }}>{totalSalidasEfectuadas} <span style={{ fontSize: '12px', fontWeight: 'normal', color: '#64748b' }}>operaciones</span></strong>
                </div>
                <div className="card-indicador" style={{ flex: 1, minWidth: '180px', backgroundColor: '#ffffff', borderRadius: '12px', padding: '15px', boxShadow: '0 4px 6px rgba(0,0,0,0.01)', borderLeft: '4px solid #10b981' }}>
                  <span style={{ fontSize: '11px', color: '#64748b', fontWeight: 'bold', display: 'block' }}>📥 ABASTECIMIENTOS (INGRESOS)</span>
                  <strong style={{ fontSize: '24px', color: '#10b981', display: 'block', marginTop: '5px' }}>{totalIngresosEfectuados} <span style={{ fontSize: '12px', fontWeight: 'normal', color: '#64748b' }}>facturas</span></strong>
                </div>
                <div className="card-indicador" style={{ flex: 1, minWidth: '180px', backgroundColor: '#ffffff', borderRadius: '12px', padding: '15px', boxShadow: '0 4px 6px rgba(0,0,0,0.01)', borderLeft: '4px solid #ef4444' }}>
                  <span style={{ fontSize: '11px', color: '#64748b', fontWeight: 'bold', display: 'block' }}>🗑️ TOTAL MERMA REGISTRADA</span>
                  <strong style={{ fontSize: '24px', color: '#ef4444', display: 'block', marginTop: '5px' }}>{totalKilosMerma.toFixed(3)} <span style={{ fontSize: '12px', fontWeight: 'normal', color: '#64748b' }}>Kg Perdidos</span></strong>
                </div>
              </div>

              <div style={{ display: 'flex', gap: '20px', flexWrap: 'wrap' }}>
                <div style={{ flex: 1, minWidth: '320px', backgroundColor: '#ffffff', borderRadius: '12px', padding: '15px', boxShadow: '0 4px 6px rgba(0,0,0,0.01)' }}>
                  <h3 style={{ margin: '0 0 15px 0', color: '#0f172a', fontSize: '13px', fontWeight: '700' }}>🔥 TOP 5 INSUMOS MÁS CONSUMIDOS (Unidades)</h3>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                    {topInsumos.length === 0 ? (
                      <span style={{ fontSize: '12px', color: '#94a3b8', fontStyle: 'italic' }}>No se registran salidas en el rango seleccionado.</span>
                    ) : topInsumos.map(([nombre, total], idx) => {
                      const porcentaje = (total / maxConsumo) * 100;
                      return (
                        <div key={idx} style={{ fontSize: '12px' }}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', fontWeight: '600', marginBottom: '4px', color: '#334155' }}>
                            <span>{idx + 1}. {nombre}</span>
                            <span>{formatStockNumber(total)} Unds</span>
                          </div>
                          <div style={{ width: '100%', height: '8px', backgroundColor: '#f1f5f9', borderRadius: '4px', overflow: 'hidden' }}>
                            <div style={{ width: `${porcentaje}%`, height: '100%', backgroundColor: '#1e3a8a', borderRadius: '4px' }}></div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>

                <div style={{ flex: 1, minWidth: '320px', backgroundColor: '#ffffff', borderRadius: '12px', padding: '15px', boxShadow: '0 4px 6px rgba(0,0,0,0.01)' }}>
                  <h3 style={{ margin: '0 0 15px 0', color: '#0f172a', fontSize: '13px', fontWeight: '700' }}>⚠️ REPORTE CRÍTICO DE MERMAS POR SEDE (Kg)</h3>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                    {Object.entries(mermasPorSede).map(([sede, kilos], idx) => {
                      const porcentaje = (kilos / maxMermaSede) * 100;
                      return (
                        <div key={idx} style={{ fontSize: '12px' }}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', fontWeight: '600', marginBottom: '4px', color: '#334155' }}>
                            <span>🏪 {sede}</span>
                            <span style={{ color: kilos > 0 ? '#ef4444' : '#64748b', fontWeight: 'bold' }}>{kilos.toFixed(3)} Kg</span>
                          </div>
                          <div style={{ width: '100%', height: '8px', backgroundColor: '#f1f5f9', borderRadius: '4px', overflow: 'hidden' }}>
                            <div style={{ width: `${porcentaje}%`, height: '100%', backgroundColor: kilos > 0 ? '#ef4444' : '#94a3b8', borderRadius: '4px' }}></div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>
            </div>
          );
        })()}

        {/* 📋 TAB: SUGERENCIA Y ENVÍO DE DESPACHOS A PLANTA */}
        {tabActiva === 'sugerir-despacho' && usuarioLogueado.id_rol === 1 && (
          <div style={{ backgroundColor: '#ffffff', borderRadius: '12px', padding: '20px', boxShadow: '0 4px 6px rgba(0,0,0,0.01)', width: '100%', boxSizing: 'border-box' }}>
            <div style={{ display: 'flex', gap: '15px', alignItems: 'center', borderBottom: '2px solid #f1f5f9', paddingBottom: '12px', marginBottom: '15px', flexWrap: 'wrap' }}>
              <div>
                <h3 style={{ margin: '0', color: '#1e3a8a', fontSize: '15px', fontWeight: '700' }}>📋 SUGERENCIA DE DESPACHOS A PLANTA (SEGÚN PAR STOCK)</h3>
                <span style={{ fontSize: '11px', color: '#64748b' }}>Revisa los quiebres de inventario calculados. Modifica las cantidades y aprueba el lote oficial.</span>
              </div>
              <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: '8px' }}>
                <label style={{ fontSize: '12px', fontWeight: 'bold', color: '#475569' }}>Fecha Despacho Camión:</label>
                <input type="date" value={fechaEnvioCamion} onChange={(e) => setFechaEnvioCamion(e.target.value)} style={{ ...styles.input, width: '150px' }} />
              </div>
            </div>

            {despachoSugeridoList.length === 0 ? (
              <div style={{ padding: '20px', textAlign: 'center', color: '#64748b', backgroundColor: '#f8fafc', borderRadius: '8px', fontSize: '13px', fontWeight: 'bold' }}>
                🎉 ¡Todos los locales se encuentran correctamente abastecidos! Ninguna sede está por debajo de su Par Stock de seguridad.
              </div>
            ) : (
              [1, 2, 3, 4].map(localId => {
                if (localesEnviadosTmp.includes(localId)) return null;

                const insumosLocal = despachoSugeridoList.filter(s => s.id_local === localId);
                if (insumosLocal.length === 0) return null;
                const nombreSede = insumosLocal[0].nombre_local;

                return (
                  <div key={localId} style={{ marginBottom: '25px', border: '1px solid #e2e8f0', borderRadius: '8px', padding: '15px' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px', backgroundColor: '#f1f5f9', padding: '8px 12px', borderRadius: '6px' }}>
                      <span style={{ fontWeight: 'bold', color: '#0f172a', fontSize: '13px' }}>🏪 DETALLE DE PEDIDO SUGERIDO PARA: {nombreSede.toUpperCase()}</span>
                      <button onClick={() => handleEnviarOrdenPlanta(localId, nombreSede)} style={{ ...styles.btnPrimary, backgroundColor: '#10b981', padding: '6px 12px', fontSize: '12px' }}>
                        🚀 Aprobar y Enviar a Planta
                      </button>
                    </div>

                    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px', textAlign: 'left' }}>
                      <thead>
                        <tr style={{ color: '#64748b', borderBottom: '1px solid #cbd5e1', height: '30px' }}>
                          <th>Código</th>
                          <th>Insumo</th>
                          <th style={{ textAlign: 'center' }}>Área</th>
                          <th style={{ textAlign: 'center' }}>Stock Actual</th>
                          <th style={{ textAlign: 'center' }}>Par Stock</th>
                          <th style={{ textAlign: 'center', color: '#c2410c' }}>Faltante Min.</th>
                          <th style={{ textAlign: 'right', color: '#1e3a8a' }}>📦 Cantidad a Enviar</th>
                        </tr>
                      </thead>
                      <tbody>
                        {insumosLocal.map((ins, idx) => {
                          const clave = `${localId}_${ins.id_insumo}`;
                          return (
                            <tr key={idx} style={{ borderBottom: '1px solid #f1f5f9', height: '35px' }}>
                              <td style={{ fontWeight: 'bold', color: '#64748b' }}>{ins.codigo_producto}</td>
                              <td style={{ fontWeight: '600', color: '#0f172a' }}>{ins.nombre_producto}</td>
                              <td style={{ textAlign: 'center' }}><span style={{ backgroundColor: '#f1f5f9', padding: '2px 6px', borderRadius: '4px', fontSize: '10px', fontWeight: 'bold' }}>{ins.categoria}</span></td>
                              <td style={{ textAlign: 'center', fontWeight: 'bold', color: '#ef4444' }}>{formatStockNumber(ins.stock_actual)}</td>
                              <td style={{ textAlign: 'center', color: '#64748b' }}>{formatStockNumber(ins.stock_minimo)}</td>
                              <td style={{ textAlign: 'center', fontWeight: 'bold', color: '#c2410c' }}>+{formatStockNumber(ins.cantidad_sugerida)}</td>
                              <td style={{ textAlign: 'right' }}>
                                <input 
                                  type="number" 
                                  value={cantidadesAdminDespacho[clave] !== undefined ? cantidadesAdminDespacho[clave] : formatStockNumber(ins.cantidad_sugerida)} 
                                  onChange={(e) => setCantidadesAdminDespacho({ ...cantidadesAdminDespacho, [clave]: e.target.value })}
                                  style={{ width: '70px', padding: '4px', textAlign: 'right', border: '1px solid #1e3a8a', borderRadius: '4px', fontWeight: 'bold', color: '#1e3a8a' }} 
                                />
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                );
              })
            )}
          </div>
        )}

        {/* 🏭 TAB: PANEL OPERATIVO DE LA PLANTA DE PRODUCCIÓN (¡AHORA CON SCROLL EN TABLE-BOX INDEPENDIENTE REAL!) */}
        {tabActiva === 'panel-planta' && (usuarioLogueado.id_rol === 1 || usuarioLogueado.id_rol === 3) && (
          <div style={{ backgroundColor: '#ffffff', borderRadius: '12px', padding: '20px', boxShadow: '0 4px 6px rgba(0,0,0,0.01)', width: '100%', boxSizing: 'border-box' }}>
            <div style={{ display: 'flex', gap: '15px', alignItems: 'center', marginBottom: '12px', borderBottom: '2px solid #f1f5f9', paddingBottom: '12px', flexWrap: 'wrap' }}>
              <div>
                <h3 style={{ margin: '0', color: '#0f172a', fontSize: '15px', fontWeight: '700' }}>🏭 PANEL OPERATIVO DE LA PLANTA DE PRODUCCIÓN</h3>
                <span style={{ fontSize: '11px', color: '#64748b' }}>Filtra las bolsas de despacho y descarga el consolidado para la cocina.</span>
              </div>
              <button onClick={exportarExcelPlanta} style={{ ...styles.btnPrimary, backgroundColor: '#10b981', marginLeft: 'auto', padding: '8px 14px', display: 'flex', alignItems: 'center', gap: '5px' }}>
                🟢 Descargar Resumen (Excel)
              </button>
            </div>

            <div style={{ display: 'flex', gap: '10px', marginBottom: '15px', flexWrap: 'wrap' }}>
              <input 
                type="text" 
                placeholder="🔍 Buscar carne o insumo..." 
                value={busquedaInsumoPlanta}
                onChange={(e) => setBusquedaInsumoPlanta(e.target.value)}
                style={{ ...styles.input, width: '200px' }}
              />
              
              <select value={filtroSedePlanta} onChange={(e) => setFiltroSedePlanta(e.target.value)} style={{ ...styles.input, width: '160px' }}>
                <option value="TODOS">-- Todas las Sedes --</option>
                <option value="Tambo Sebas">Tambo Sebas</option>
                <option value="Grande Hermanos">Grande Hermanos</option>
                <option value="Chicken House">Chicken House</option>
                <option value="Country Club">Country Club</option>
              </select>

              <div style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
                <label style={{ fontSize: '11px', fontWeight: 'bold', color: '#64748b' }}>Filtrar Entrega:</label>
                <input type="date" value={filtroFechaPlanta} onChange={(e) => setFiltroFechaPlanta(e.target.value)} style={{ ...styles.input, width: '140px' }} />
                {filtroFechaPlanta && <button onClick={() => setFiltroFechaPlanta("")} style={{ padding: '4px 8px', backgroundColor: '#64748b', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer' }}>❌</button>}
              </div>
            </div>

            {/* ✨ SOLUCIÓN AL SCROLL ACUMULATIVO: Caja fija scroll-box con altura máxima dinámica y soporte táctil para móviles */}
            <div className="table-scroll-box" style={{ overflowX: 'auto', overflowY: 'auto', maxHeight: '480px', border: '1px solid #cbd5e1', borderRadius: '8px', position: 'relative', width: '100%', display: 'block', WebkitOverflowScrolling: 'touch' }}>
              <table style={{ width: '100%', borderCollapse: 'separate', borderSpacing: 0, minWidth: '750px', fontSize: '12px' }}>
                <thead style={{ position: 'sticky', top: 0, zIndex: 3, backgroundColor: '#f8fafc', color: '#475569' }}>
                  <tr style={{ borderBottom: '2px solid #cbd5e1' }}>
                    <th style={{ padding: '10px', backgroundColor: '#f8fafc', borderBottom: '2px solid #cbd5e1' }}>Fecha Entrega (Despacho)</th>
                    <th style={{ padding: '10px', backgroundColor: '#f8fafc', borderBottom: '2px solid #cbd5e1' }}>Sede de Destino</th>
                    <th style={{ padding: '10px', backgroundColor: '#f8fafc', borderBottom: '2px solid #cbd5e1' }}>Insumo a Preparar</th>
                    <th style={{ padding: '10px', textAlign: 'center', backgroundColor: '#f8fafc', borderBottom: '2px solid #cbd5e1' }}>Área</th>
                    <th style={{ padding: '10px', textAlign: 'right', color: '#1e3a8a', backgroundColor: '#f8fafc', borderBottom: '2px solid #cbd5e1' }}>📦 Cantidad Aprobada Admin</th>
                    <th style={{ padding: '10px', textAlign: 'center', backgroundColor: '#f8fafc', borderBottom: '2px solid #cbd5e1' }}>Estado Operativo</th>
                  </tr>
                </thead>
                <tbody>
                  {ordenesPlantaFiltradas.length === 0 ? (
                    <tr>
                      <td colSpan="6" style={{ padding: '20px', textAlign: 'center', color: '#94a3b8', fontStyle: 'italic' }}>
                        No hay órdenes de despacho registradas que coincidan con los filtros.
                      </td>
                    </tr>
                  ) : (
                    ordenesPlantaFiltradas.map((ord, idx) => {
                      const esPendiente = ord.estado_orden === 'ENVIADO';
                      return (
                        <tr key={idx} style={{ borderBottom: '1px solid #f1f5f9', height: '35px', backgroundColor: esPendiente ? '#ffffff' : '#f8fafc' }}>
                          <td style={{ padding: '10px', fontWeight: 'bold', color: esPendiente ? '#b45309' : '#64748b', borderBottom: '1px solid #f1f5f9' }}>{formatearFechaLimpia(ord.fecha_envio)}</td>
                          <td style={{ padding: '10px', fontWeight: '700', color: esPendiente ? '#1e3a8a' : '#64748b', borderBottom: '1px solid #f1f5f9' }}>{ord.origen}</td>
                          <td style={{ padding: '10px', fontWeight: '600', color: esPendiente ? '#0f172a' : '#64748b', textDecoration: esPendiente ? 'none' : 'line-through', borderBottom: '1px solid #f1f5f9' }}>{ord.insumo}</td>
                          <td style={{ padding: '10px', textAlign: 'center', borderBottom: '1px solid #f1f5f9' }}>
                            <span style={{ backgroundColor: '#f1f5f9', padding: '2px 6px', borderRadius: '4px', fontSize: '10px', fontWeight: 'bold' }}>{ord.categoria}</span>
                          </td>
                          <td style={{ padding: '10px', textAlign: 'right', fontWeight: 'bold', fontSize: '13px', color: esPendiente ? '#10b981' : '#64748b', borderBottom: '1px solid #f1f5f9' }}>
                            {formatStockNumber(ord.cantidad_aprobada_admin)}
                          </td>
                          <td style={{ padding: '10px', textAlign: 'center', borderBottom: '1px solid #f1f5f9' }}>
                            <span style={{ 
                              backgroundColor: esPendiente ? '#fff7ed' : '#dcfce7', 
                              color: esPendiente ? '#c2410c' : '#15803d', 
                              padding: '3px 8px', borderRadius: '20px', fontSize: '10px', fontWeight: '800' 
                            }}>
                              {esPendiente ? '🚚 En Camino' : '✓ Entregado'}
                            </span>
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* TAB 1: MATRIZ DE STOCK */}          
        {tabActiva === 'stock' && usuarioLogueado.id_rol !== 3 && (
          <div style={{ backgroundColor: '#ffffff', borderRadius: '12px', padding: '15px 20px', boxShadow: '0 4px 6px rgba(0,0,0,0.01)', width: '100%', boxSizing: 'border-box' }}>
            
            {/* Alerta de Despachos en Camino desde Planta para Encargados */}
            {usuarioLogueado.id_rol === 2 && despachosPendientesSede.length > 0 && (
              <div style={{ backgroundColor: '#eff6ff', border: '1px solid #bfdbfe', borderRadius: '8px', padding: '16px', marginBottom: '15px' }}>
                <h3 style={{ color: '#1e40af', marginTop: 0, display: 'flex', alignItems: 'center', gap: '8px', fontSize: '14px' }}>
                  🚚 ¡ATENCIÓN! Tienes despachos oficiales en camino desde la Planta de Producción
                </h3>
                {(() => {
                  const ordenesIds = [...new Set(despachosPendientesSede.map(d => d.id_orden))];
                  return ordenesIds.map(idOrden => {
                    const itemsOrden = despachosPendientesSede.filter(d => d.id_orden === idOrden);
                    return (
                      <div key={idOrden} style={{ backgroundColor: '#ffffff', border: '1px solid #cbd5e1', borderRadius: '6px', padding: '12px', marginBottom: '10px' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid #e2e8f0', paddingBottom: '6px', marginBottom: '8px' }}>
                          <span style={{ fontSize: '12px', fontWeight: 'bold', color: '#1e3a8a' }}>📦 DESPACHO ORDEN CLASIFICADA NRO #${idOrden}</span>
                          <button onClick={() => handleRecibirDespachoPlanta(idOrden)} style={{ backgroundColor: '#10b981', color: 'white', border: 'none', padding: '5px 12px', borderRadius: '4px', cursor: 'pointer', fontWeight: 'bold', fontSize: '11px' }}>
                            ✓ Confirmar Descarga Física Real
                          </button>
                        </div>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                          {itemsOrden.map(item => (
                            <div key={item.id_detalle} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '12px' }}>
                              <span>🥩 <strong style={{ color: '#0f172a' }}>{item.insumo}</strong> ({item.categoria}) — <small style={{ color: '#64748b' }}>Admin ordenó mandar: {formatStockNumber(item.cantidad_aprobada_admin)} Unds</small></span>
                              <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                                <label style={{ fontSize: '11px', color: '#475569', fontWeight: 'bold' }}>Cant. que llegó:</label>
                                <input 
                                  type="number" 
                                  placeholder="Contar..."
                                  value={cantidadesRealesEncargado[item.id_detalle] ?? ""} 
                                  onChange={(e) => setCantidadesRealesEncargado({ ...cantidadesRealesEncargado, [item.id_detalle]: e.target.value })}
                                  style={{ width: '80px', padding: '3px 5px', borderRadius: '4px', border: '1px solid #ef4444', textAlign: 'right', fontWeight: 'bold', backgroundColor: '#fff5f5' }} 
                                />
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    );
                  });
                })()}
              </div>
            )}

            {/* Traslados entre locales */}
            {trasladosPendientes.length > 0 && (
              <div style={{ backgroundColor: '#fff7ed', border: '1px solid #ffedd5', borderRadius: '8px', padding: '16px', marginBottom: '20px' }}>
                  <h3 style={{ color: '#c2410c', marginTop: 0, display: 'flex', alignItems: 'center', gap: '8px' }}>
                      🚚 Tienes traslados entrantes pendientes por confirmar
                  </h3>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                      {trasladosPendientes.map((traslado) => (
                          <div key={traslado.id_movimiento} style={{ backgroundColor: '#ffffff', border: '1px solid #e2e8f0', borderRadius: '6px', padding: '12px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '10px' }}>
                              <div style={{ fontSize: '13px' }}>
                                  <span style={{ fontWeight: 'bold', color: '#1e3a8a' }}>{traslado.insumo}</span> 
                                  <span style={{ color: '#64748b' }}> enviado desde </span>
                                  <span style={{ fontWeight: 'bold', color: '#0f766e' }}>{traslado.origen}</span>
                                  <br />
                                  <small style={{ color: '#94a3b8' }}>Cantidad enviada: {traslado.cantidad_unidades} Unds ({traslado.categoria})</small>
                              </div>
                              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                                  <label style={{ fontSize: '12px', color: '#475569' }}>Cant. Recibida:</label>
                                  <input 
                                      type="number" 
                                      placeholder={traslado.cantidad_unidades}
                                      value={cantidadesRecibidas[traslado.id_movimiento] ?? ""} 
                                      onChange={(e) => setCantidadesRecibidas({ ...cantidadesRecibidas, [traslado.id_movimiento]: e.target.value })}
                                      style={{ width: '80px', padding: '4px 6px', borderRadius: '4px', border: '1px solid #cbd5e1', textAlign: 'right' }} 
                                  />
                                  <button 
                                      onClick={() => handleConfirmarTraslado(traslado.id_movimiento, traslado.cantidad_unidades)}
                                      style={{ backgroundColor: '#c2410c', color: 'white', border: 'none', padding: '6px 12px', borderRadius: '4px', cursor: 'pointer', fontWeight: 'bold', fontSize: '12px' }}
                                  >
                                      Confirmar Recepción ✓
                                  </button>
                              </div>
                          </div>
                      ))}
                  </div>
              </div>
            )}

            <div className="filter-row-ui" style={{ display: 'flex', gap: '10px', alignItems: 'center', marginBottom: '12px', borderBottom: '2px solid #f1f5f9', paddingBottom: '8px', flexWrap: 'wrap' }}>
              <div>
                <h2 style={{ margin: '0', color: '#1e293b', fontSize: '14px', fontWeight: '700' }}>📊 INVENTARIO DE STOCK</h2>
                {usuarioLogueado.id_rol === 1 && (
                  <span style={{ fontSize: '10px', color: '#64748b', fontWeight: 'bold', display: 'block' }}>RANGO: {fechaInicioStock} AL {filtros.fecha_fin}</span>
                )}
              </div>
              
              <input 
                type="text" 
                placeholder="🔍 Buscar insumo..." 
                value={busquedaInsumo} 
                onChange={(e) => setBusquedaInsumo(e.target.value)} 
                style={{ padding: '6px 10px', borderRadius: '6px', border: '1px solid #cbd5e1', fontSize: '12px', width: '160px', marginLeft: 'auto' }} 
              />

              {usuarioLogueado.id_rol === 1 && (
                <>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
                    <input type="date" value={fechaInicioStock} onChange={(e) => setFechaInicioStock(e.target.value)} style={{ padding: '3px 6px', borderRadius: '4px', border: '1px solid #cbd5e0', fontSize: '11px' }} />
                    <input type="date" value={filtros.fecha_fin} onChange={(e) => setFiltros({ ...filtros, fecha_fin: e.target.value })} style={{ padding: '3px 6px', borderRadius: '4px', border: '1px solid #cbd5e0', fontSize: '11px' }} />
                  </div>
                  <div style={{ display: 'flex', gap: '5px' }}>
                    <button onClick={exportarExcelCompleto} style={{ padding: '5px 10px', backgroundColor: '#10b981', color: 'white', border: 'none', borderRadius: '4px', fontWeight: 'bold', fontSize: '11px', cursor: 'pointer' }}>🟢 Excel</button>
                    <button onClick={() => window.print()} style={{ padding: '5px 10px', backgroundColor: '#ef4444', color: 'white', border: 'none', borderRadius: '4px', fontWeight: 'bold', fontSize: '11px', cursor: 'pointer' }}>🔴 PDF</button>
                  </div>
                </>
              )}
            </div>

            <div className="table-scroll-box" style={{ overflowX: 'auto', overflowY: 'auto', maxHeight: '520px', border: '1px solid #cbd5e1', borderRadius: '8px', position: 'relative', width: '100%', display: 'block', WebkitOverflowScrolling: 'touch' }}>
              <table style={{ width: '100%', borderCollapse: 'separate', borderSpacing: 0, minWidth: '700px', fontSize: '12px' }}>
                <thead style={{ position: 'sticky', top: 0, zIndex: 3, backgroundColor: '#1e3a8a', color: 'white' }}>
                  <tr>
                    <th style={{ padding: '10px', textAlign: 'left', position: 'sticky', left: 0, backgroundColor: '#1e3a8a', zIndex: 4, borderBottom: '2px solid #cbd5e1' }}>Insumo Maestro</th>
                    {(usuarioLogueado.id_rol === 1 || usuarioLogueado.id_local === 1) && <th style={{ padding: '10px', textAlign: 'center', borderBottom: '2px solid #cbd5e1' }}>Tambo Sebas</th>}
                    {(usuarioLogueado.id_rol === 1 || usuarioLogueado.id_local === 2) && <th style={{ padding: '10px', textAlign: 'center', borderBottom: '2px solid #cbd5e1' }}>Grandes Hermanos</th>}
                    {(usuarioLogueado.id_rol === 1 || usuarioLogueado.id_local === 3) && <th style={{ padding: '10px', textAlign: 'center', borderBottom: '2px solid #cbd5e1' }}>Chicken House</th>}
                    {(usuarioLogueado.id_rol === 1 || usuarioLogueado.id_local === 4) && <th style={{ padding: '10px', textAlign: 'center', borderBottom: '2px solid #cbd5e1' }}>Country Club</th>}
                    {usuarioLogueado.id_rol === 1 && <th style={{ padding: '10px', textAlign: 'center', backgroundColor: '#0d9488', borderBottom: '2px solid #cbd5e1' }}>VALOR (S/)</th>}
                  </tr>
                </thead>
                <tbody>
                  {(() => {
                    let totalTamboValor = 0; let totalGrandesValor = 0; let totalChickenValor = 0; let totalCountryValor = 0; let totalCorp = 0;
                    return (
                      <>
                       {stockRealFiltrado.map((stk, i) => {
                          const cost = Number(stk.costo_unitario_promedio) || 0;
                          const uS1 = Number(stk.tambo_sebas_unidades) || 0; 
                          const uS2 = Number(stk.grandes_hermanos_unidades) || 0;
                          const uS3 = Number(stk.chicken_house_unidades) || 0; 
                          const uS4 = Number(stk.country_club_unidades) || 0;
                          
                          const vFila = (uS1 + uS2 + uS3 + uS4) * cost;
                          totalTamboValor += uS1 * cost; 
                          totalGrandesValor += uS2 * cost;
                          totalChickenValor += uS3 * cost;
                          totalCountryValor += uS4 * cost;
                          totalCorp += vFila;
                          
                          return (
                            <tr key={i} style={{ backgroundColor: '#ffffff' }}>
                              <td style={{ padding: '10px', fontWeight: '600', backgroundColor: '#f8fafc', position: 'sticky', left: 0, zIndex: 2, borderBottom: '1px solid #cbd5e1', borderRight: '1px solid #cbd5e1' }}>
                                {stk.nombre_producto} 
                              </td>
                              {(usuarioLogueado.id_rol === 1 || usuarioLogueado.id_local === 1) && <td style={celdaAlertaAdminStyle(uS1, stk.min_tambo_sebas, usuarioLogueado.id_rol)}>{formatStockNumber(uS1)}</td>}
                              {(usuarioLogueado.id_rol === 1 || usuarioLogueado.id_local === 2) && <td style={celdaAlertaAdminStyle(uS2, stk.min_grandes_hermanos, usuarioLogueado.id_rol)}>{formatStockNumber(uS2)}</td>}
                              {(usuarioLogueado.id_rol === 1 || usuarioLogueado.id_local === 3) && <td style={celdaAlertaAdminStyle(uS3, stk.min_chicken_house, usuarioLogueado.id_rol)}>{formatStockNumber(uS3)}</td>}
                              {(usuarioLogueado.id_rol === 1 || usuarioLogueado.id_local === 4) && <td style={celdaAlertaAdminStyle(uS4, stk.min_country_club, usuarioLogueado.id_rol)}>{formatStockNumber(uS4)}</td>}
                              {usuarioLogueado.id_rol === 1 && (
                                <td style={{ padding: '10px', textAlign: 'center', fontWeight: 'bold', color: '#0d9488', backgroundColor: '#f0fdfa', borderBottom: '1px solid #cbd5e1', borderRight: '1px solid #cbd5e1' }}>S/ {vFila.toFixed(2)}</td>
                              )}
                            </tr>
                          );
                        })}
                        {usuarioLogueado.id_rol === 1 && (
                          <tr style={{ position: 'sticky', bottom: 0, zIndex: 3, backgroundColor: '#e2e8f0', fontWeight: 'bold', color: '#0f172a' }}>
                            <td style={{ padding: '12px 10px', backgroundColor: '#cbd5e1', position: 'sticky', left: 0, zIndex: 4, borderTop: '2px solid #94a3b8' }}>💰 TOTAL VALORIZADO (S/):</td>
                            <td style={{ padding: '12px 10px', textAlign: 'center', borderTop: '2px solid #94a3b8', color: '#16a34a' }}>S/ {totalTamboValor.toFixed(2)}</td>
                            <td style={{ padding: '12px 10px', textAlign: 'center', borderTop: '2px solid #94a3b8', color: '#16a34a' }}>S/ {totalGrandesValor.toFixed(2)}</td>
                            <td style={{ padding: '12px 10px', textAlign: 'center', borderTop: '2px solid #94a3b8', color: '#16a34a' }}>S/ {totalChickenValor.toFixed(2)}</td>
                            <td style={{ padding: '12px 10px', textAlign: 'center', borderTop: '2px solid #94a3b8', color: '#16a34a' }}>S/ {totalCountryValor.toFixed(2)}</td>
                            <td style={{ padding: '12px 10px', textAlign: 'center', color: 'white', backgroundColor: '#0d9488', borderTop: '2px solid #94a3b8' }}>S/ {totalCorp.toFixed(2)}</td>
                          </tr>
                        )}
                      </>
                    );
                  })()}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* ⚙️ PESTAÑA PARA REGISTRAR MÍNIMOS POR LOCAL */}
        {tabActiva === 'config-minimos' && usuarioLogueado.id_rol === 1 && (
          <div style={{ backgroundColor: '#ffffff', borderRadius: '12px', padding: '20px', boxShadow: '0 4px 6px rgba(0,0,0,0.01)', width: '100%', boxSizing: 'border-box' }}>
            <div style={{ display: 'flex', gap: '15px', alignItems: 'center', borderBottom: '2px solid #f1f5f9', paddingBottom: '12px', marginBottom: '15px', flexWrap: 'wrap' }}>
              <div>
                <h3 style={{ margin: '0', color: '#1e3a8a', fontSize: '15px', fontWeight: '700' }}>⚙️ CONFIGURACIÓN DE PAR STOCKS POR SEDE</h3>
                <span style={{ fontSize: '11px', color: '#64748b' }}>Asigna las alertas mínimas individuales para cada local</span>
              </div>
              <select 
                value={localSeleccionadoMinimos} 
                onChange={(e) => setLocalSeleccionadoMinimos(e.target.value)} 
                style={{ ...styles.input, width: '240px', marginLeft: 'auto', border: '2px solid #1e3a8a', fontWeight: 'bold', color: '#1e3a8a' }}
              >
                <option value="1">🏪 Tambo Sebas</option>
                <option value="2">🏪 Grande Hermanos</option>
                <option value="3">🏪 Chicken House</option>
                <option value="4">🏪 Country Club</option>
              </select>
            </div>

            <div style={{ overflowX: 'auto', overflowY: 'auto', maxHeight: '480px', border: '1px solid #e2e8f0', borderRadius: '8px' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '12px' }}>
                <thead style={{ backgroundColor: '#f8fafc', position: 'sticky', top: 0, zIndex: 1 }}>
                  <tr style={{ color: '#475569', borderBottom: '2px solid #cbd5e1' }}>
                    <th style={{ padding: '10px' }}>Código</th>
                    <th style={{ padding: '10px' }}>Insumo</th>
                    <th style={{ padding: '10px', textAlign: 'center' }}>Área</th>
                    <th style={{ padding: '10px', textAlign: 'right', color: '#c2410c' }}>📦 Stock Mínimo</th>
                  </tr>
                </thead>
                <tbody>
                  {minimosPorLocalList.map((ins, idx) => (
                    <tr key={idx} style={{ borderBottom: '1px solid #f1f5f9' }}>
                      <td style={{ padding: '10px', fontWeight: 'bold', color: '#64748b' }}>{ins.codigo_producto}</td>
                      <td style={{ padding: '10px', fontWeight: '600', color: '#0f172a' }}>{ins.nombre_producto}</td>
                      <td style={{ padding: '10px', textAlign: 'center' }}>
                        <span style={{ backgroundColor: ins.categoria === 'HORNO' ? '#ffedd5' : ins.categoria === 'BAR' ? '#e0f2fe' : '#f1f5f9', color: ins.categoria === 'HORNO' ? '#c2410c' : '#475569', padding: '2px 6px', borderRadius: '4px', fontSize: '10px', fontWeight: 'bold' }}>{ins.categoria}</span>
                      </td>
                      <td style={{ padding: '4px 10px', textAlign: 'right' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '4px', justifyContent: 'flex-end' }}>
                          <input 
                            type="number" 
                            placeholder="0" 
                            value={minimosEditables[ins.id_insumo] !== undefined ? minimosEditables[ins.id_insumo] : ins.stock_minimo} 
                            onChange={(e) => setMinimosEditables({ ...minimosEditables, [ins.id_insumo]: e.target.value })} 
                            style={{ width: '65px', padding: '4px', textAlign: 'right', border: '1px solid #cbd5e1', borderRadius: '4px', fontWeight: 'bold' }} 
                          />
                          <button onClick={() => ejecutarGuardadoMinimoPorLocal(ins.id_insumo)} style={{ padding: '4px 8px', backgroundColor: '#f97316', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer', fontWeight: 'bold' }}>💾</button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* TAB 2: CATÁLOGO DE INSUMOS */}
        {tabActiva === 'insumos' && usuarioLogueado.id_rol === 1 && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '15px', width: '100%' }}>
            <div style={{ display: 'flex', gap: '15px', flexWrap: 'wrap' }}>
              <div style={{ flex: 1, minWidth: '300px', backgroundColor: '#ffffff', borderRadius: '12px', padding: '15px', boxShadow: '0 4px 6px rgba(0,0,0,0.01)' }}>
                <h3 style={{ margin: '0 0 10px 0', color: '#1e3a8a', fontSize: '13px', fontWeight: '700' }}>🧱 REGISTRO INDIVIDUAL</h3>
                <form onSubmit={handleCreateInsumo} style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                  <input type="text" placeholder="Nombre Insumo" value={nuevoInsumoNombre} onChange={(e) => setNuevoInsumoNombre(e.target.value)} style={styles.input} required />
                  <select value={nuevaCategoria} onChange={(e) => setNuevoCategoria(e.target.value)} style={styles.input}>
                    <option value="COCINA">🍳 COCINA</option><option value="HORNO">🔥 HORNO</option><option value="BAR">🍸 BAR</option>
                  </select>
                  <button type="submit" style={{ ...styles.btnPrimary, backgroundColor: '#0d9488', padding: '8px' }}>💾 Inyectar Insumo</button>
                </form>
              </div>
              <div style={{ flex: 1, minWidth: '300px', backgroundColor: '#ffffff', borderRadius: '12px', padding: '15px', boxShadow: '0 4px 6px rgba(0,0,0,0.01)', borderLeft: '4px solid #10b981' }}>
                <h3 style={{ margin: '0 0 10px 0', color: '#065f46', fontSize: '13px', fontWeight: '700' }}>⚡ ACCIONES MASIVAS</h3>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                  <button onClick={exportarCatalogoExcel} style={{ ...styles.btnPrimary, backgroundColor: '#475569', padding: '8px' }}>📤 Exportar Listado Excel</button>
                  <div>
                    <label style={{ fontSize: '11px', fontWeight: 'bold', color: '#374151', display: 'block', marginBottom: '4px' }}>📥 Importar Catálogo desde Excel (.CSV):</label>
                    <input type="file" accept=".csv" onChange={handleImportarInsumosCSV} style={{ fontSize: '12px' }} />
                  </div>
                </div>
              </div>
            </div>

            <div style={{ backgroundColor: '#ffffff', borderRadius: '12px', padding: '15px', boxShadow: '0 4px 6px rgba(0,0,0,0.01)' }}>
              <h3 style={{ margin: '0 0 10px 0', color: '#334155', fontSize: '13px', fontWeight: '700' }}>📋 PRODUCTOS CREADOS EN EL SISTEMA CONSOLIDADO ({insumosList.length})</h3>
              <div style={{ overflowX: 'auto', overflowY: 'auto', maxHeight: '400px', border: '1px solid #e2e8f0', borderRadius: '8px' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '12px' }}>
                  <thead style={{ backgroundColor: '#f8fafc', position: 'sticky', top: 0, zIndex: 1 }}>
                    <tr style={{ color: '#475569', borderBottom: '2px solid #cbd5e1' }}>
                      <th style={{ padding: '8px' }}>ID</th>
                      <th style={{ padding: '8px', color: '#1e3a8a' }}>Código Único</th>
                      <th style={{ padding: '8px' }}>Descripción del Insumo</th>
                      <th style={{ padding: '8px', textAlign: 'center' }}>Área Asignada</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(insumosList || []).map((ins, idx) => (
                      <tr key={idx} style={{ borderBottom: '1px solid #f1f5f9' }}>
                        <td style={{ padding: '8px', color: '#64748b' }}>{ins.id_insumo}</td>
                        <td style={{ padding: '8px', fontWeight: 'bold', color: '#1e3a8a' }}>{ins.codigo_producto}</td>
                        <td style={{ padding: '8px', fontWeight: '600', color: '#0f172a' }}>{ins.nombre_producto}</td>
                        <td style={{ padding: '8px', textAlign: 'center' }}>
                          <span style={{ backgroundColor: ins.categoria === 'HORNO' ? '#ffedd5' : ins.categoria === 'BAR' ? '#e0f2fe' : '#f1f5f9', color: ins.categoria === 'HORNO' ? '#c2410c' : ins.categoria === 'BAR' ? '#0369a1' : '#475569', padding: '2px 6px', borderRadius: '4px', fontSize: '10px', fontWeight: 'bold' }}>{ins.categoria}</span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

        {/* TAB 3: REGISTRO MOVIMIENTOS */}
        {tabActiva === 'operaciones' && usuarioLogueado.id_rol !== 3 && (
          <div style={{ backgroundColor: '#ffffff', borderRadius: '12px', padding: '20px', boxShadow: '0 4px 6px rgba(0,0,0,0.01)', maxWidth: '500px' }}>
            <h3 style={{ margin: '0 0 15px 0', color: '#1e3a8a', fontSize: '14px', fontWeight: '700' }}>📝 REGISTRO DE MOVIMIENTOS</h3>
            <form onSubmit={handleSubmitMovimiento} style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              <div style={{ display: 'flex', gap: '12px' }}>
                {usuarioLogueado.id_rol === 1 ? (
                  <select value={form.id_local_origen} onChange={(e) => setForm({ ...form, id_local_origen: e.target.value })} style={styles.input}>
                    <option value="1">Tambo Sebas</option><option value="2">Grande Hermanos</option><option value="3">Chicken House</option><option value="4">Country Club</option>
                  </select>
                ) : (
                  <input type="text" value={usuarioLogueado.nombre_local} style={{ ...styles.input, backgroundColor: '#f1f5f9', color: '#475569', fontWeight: 'bold' }} disabled />
                )}
                <input type="date" value={form.fecha_retroactiva} onChange={(e) => setForm({ ...form, fecha_retroactiva: e.target.value })} style={styles.input} required />
              </div>
              
              <select value={form.id_insumo} onChange={(e) => handleInsumoChange(e.target.value)} style={styles.input} required>
                <option value="">-- Seleccionar Insumo --</option>
                {insumosList.map((ins, i) => <option key={i} value={ins.id_insumo}>{ins.nombre_producto}</option>)}
              </select>

              {usuarioLogueado.id_rol === 1 ? (
                <select value={form.tipo_movimiento} onChange={(e) => setForm({ ...form, tipo_movimiento: e.target.value })} style={styles.input}>
                  <option value="SALIDA">SALIDA (VENTA / CONSUMO)</option>
                  <option value="INGRESO">INGRESO</option>
                </select>
              ) : (
                <select value={form.type_mov_encargado || "INGRESO"} onChange={(e) => setForm({ ...form, type_mov_encargado: e.target.value, id_local_destino: "" })} style={styles.input}>
                  <option value="INGRESO">INGRESO</option>
                  <option value="PRÉSTAMO">PRÉSTAMO</option>
                  <option value="DEVOLUCIÓN">DEVOLUCIÓN</option>
                </select>
              )}

              {usuarioLogueado.id_rol === 2 && (form.type_mov_encargado === "PRÉSTAMO" || form.type_mov_encargado === "DEVOLUCIÓN") && (
                <select value={form.id_local_destino} onChange={(e) => setForm({ ...form, id_local_destino: e.target.value })} style={styles.input} required>
                  <option value="">-- Seleccionar Sede Relacionada --</option>
                  {usuarioLogueado.id_local !== 1 && <option value="1">Tambo Sebas</option>}
                  {usuarioLogueado.id_local !== 2 && <option value="2">Grande Hermanos</option>}
                  {usuarioLogueado.id_local !== 3 && <option value="3">Chicken House</option>}
                  {usuarioLogueado.id_local !== 4 && <option value="4">Country Club</option>}
                </select>
              )}

              <select value={form.categoria} onChange={(e) => setForm({ ...form, categoria: e.target.value })} style={styles.input}>
                <option value="COCINA">🍳 COCINA</option><option value="HORNO">🔥 HORNO</option><option value="BAR">🍸 BAR</option>
              </select>

              <div style={{ display: 'flex', gap: '12px' }}>
                {(!form.id_insumo || !insumosList.find(i => i.id_insumo.toString() === form.id_insumo.toString())?.maneja_peso) ? (
                  <input 
                    type="number" 
                    step="0.01" 
                    placeholder="Cantidad (Unidades / Cajas / Sacos)" 
                    value={form.cantidad_unidades} 
                    onChange={(e) => setForm({ ...form, cantidad_unidades: e.target.value, cantidad_kilogramos: "0" })} 
                    style={styles.input} 
                    required 
                  />
                ) : (
                  <input 
                    type="number" 
                    step="0.001" 
                    placeholder="Peso exacto (Kg)" 
                    value={form.cantidad_kilogramos} 
                    onChange={(e) => setForm({ ...form, cantidad_kilogramos: e.target.value, cantidad_unidades: "0" })} 
                    style={styles.input} 
                    required 
                  />
                )}
              </div>

              {usuarioLogueado.id_rol === 1 && form.tipo_movimiento === "SALIDA" && (
                <div style={{ marginTop: '4px' }}>
                  <label style={{ fontSize: '11px', fontWeight: 'bold', color: '#b91c1c', display: 'block', marginBottom: '4px' }}>⚠️ Registrar peso de Merma u Horno (Opcional - Kg):</label>
                  <input 
                    type="number" 
                    step="0.001" 
                    placeholder="Ej: 0.850 (Kilos perdidos)" 
                    value={form.merma_kilogramos} 
                    onChange={(e) => setForm({ ...form, merma_kilogramos: e.target.value })} 
                    style={{ ...styles.input, border: '1px solid #f87171', backgroundColor: '#fef2f2', color: '#991b1b', fontWeight: 'bold' }} 
                  />
                </div>
              )}
              
              {usuarioLogueado.id_rol === 1 && form.tipo_movimiento === "INGRESO" && (
                <input type="number" step="0.01" placeholder="Costo Total S/" value={form.precio_total} onChange={(e) => setForm({ ...form, precio_total: e.target.value })} style={styles.input} required />
              )}
              
              <textarea placeholder="Comentarios o notas..." value={form.comentario} onChange={(e) => setForm({ ...form, comentario: e.target.value })} style={{ ...styles.input, height: '60px', resize: 'none' }} />
              <button type="submit" style={{ ...styles.btnPrimary, padding: '10px' }}>🚀 REGISTRAR OPERACIÓN</button>
            </form>
          </div>
        )}

        {/* TAB 4: HISTORIAL COMPLETO */}
        {tabActiva === 'historial' && usuarioLogueado.id_rol !== 3 && (
          <div style={{ backgroundColor: '#ffffff', borderRadius: '12px', padding: '15px', boxShadow: '0 4px 6px rgba(0,0,0,0.01)', width: '100%', boxSizing: 'border-box' }}>
            <div style={{ display: 'flex', gap: '10px', alignItems: 'center', borderBottom: '2px solid #f1f5f9', paddingBottom: '10px', marginBottom: '12px', flexWrap: 'wrap' }}>
              <h3 style={{ margin: '0', color: '#1e293b', fontSize: '14px', fontWeight: '700' }}>📜 HISTORIAL DE MOVIMIENTOS</h3>
              
              {usuarioLogueado.id_rol === 1 && (
                <select value={filtroSedeHistorial} onChange={(e) => setFiltroSedeHistorial(e.target.value)} style={{ padding: '5px', borderRadius: '6px', fontSize: '12px', border: '1px solid #cbd5e1', marginLeft: 'auto' }}>
                  <option value="TODOS">-- Todas las Sedes --</option>
                  <option value="Tambo Sebas">Tambo Sebas</option><option value="Grande Hermanos">Grande Hermanos</option><option value="Chicken House">Chicken House</option><option value="Country Club">Country Club</option>
                </select>
              )}

              <select 
                value={filtroOperacionHistorial} 
                onChange={(e) => setFiltroOperacionHistorial(e.target.value)} 
                style={{ padding: '5px', borderRadius: '6px', fontSize: '12px', border: '1px solid #cbd5e1', marginLeft: usuarioLogueado.id_rol === 2 ? 'auto' : '0' }}
              >
                <option value="TODOS">-- Operaciones --</option>
                <option value="INGRESO">INGRESO</option>
                <option value="SALIDA">SALIDA</option>
                <option value="PRESTAMO">PRÉSTAMO</option>
                <option value="DEVOLUCION">DEVOLUCIÓN</option>
              </select>
            </div>

            <div style={{ overflowX: 'auto', overflowY: 'auto', maxHeight: '550px', border: '1px solid #e2e8f0', borderRadius: '8px', width: '100%' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '12px', minWidth: usuarioLogueado.id_rol === 1 ? '1380px' : '750px' }}>
                <thead style={{ backgroundColor: '#f8fafc', position: 'sticky', top: 0, zIndex: 1 }}>
                  <tr style={{ color: '#64748b', borderBottom: '2px solid #cbd5e1' }}>
                    <th style={{ padding: '8px 10px' }}>Nro</th>
                    <th style={{ padding: '8px 10px', color: '#1e3a8a', fontWeight: 'bold' }}>📅 Fecha</th>
                    <th style={{ padding: '8px 10px' }}>Origen</th>
                    <th style={{ padding: '8px 10px' }}>Operación</th>
                    <th style={{ padding: '8px 10px', color: '#1e3a8a', fontWeight: 'bold' }}>Área</th>
                    <th style={{ padding: '8px 10px' }}>Insumo</th>
                    <th style={{ padding: '8px 10px', textAlign: 'right' }}>Unds</th>
                    <th style={{ padding: '8px 10px', textAlign: 'right' }}>Kilos</th>
                    <th style={{ padding: '8px 10px' }}>Destino</th>
                    {usuarioLogueado.id_rol === 1 && (
                      <th style={{ padding: '8px 10px', textAlign: 'right', color: '#ef4444' }}>Merma (Kg)</th>
                    )}
                    {usuarioLogueado.id_rol === 1 && (
                      <>
                        <th style={{ padding: '8px 10px', textAlign: 'right', color: '#0d9488' }}>💰 Costo Und</th>
                        <th style={{ padding: '8px 10px', textAlign: 'right', color: '#b45309' }}>⚖️ Costo Kg</th>
                        <th style={{ padding: '8px 12px', textAlign: 'right', backgroundColor: '#f0fdfa' }}>Costo Total</th>
                      </>
                    )}
                    <th style={{ padding: '8px 10px', color: '#1e3a8a', fontWeight: 'bold' }}>Comentario</th>
                    <th style={{ padding: '8px 10px' }}>Encargado</th>
                  </tr>
                </thead>
                <tbody>
                  {reportesFiltrados && reportesFiltrados.map((rep, idx) => {
                    const idMov = rep.Nro || rep.id_movimiento || (idx + 1);
                    const fechaStr = rep.Fecha_Hora || rep.fecha_registro || '-';
                    const localOrigen = rep.Origen || rep.nombre_local || "";
                    const op = rep.Operacion || rep.tipo_movimiento || "";
                    const area = rep.Categoria || rep.categoria || "COCINA";
                    const nombreInsumo = rep.Insumo || rep.nombre_producto || "";
                    const total = parseFloat(rep.Total_Soles || rep.total_soles) || 0;
                    const txtComentario = rep.comentario || rep.Comentario || '';
                    const uP = parseFloat(rep.Unds || rep.cantidad_unidades) || 0;
                    const kP = parseFloat(rep.Kilos || rep.cantidad_kilogramos) || 0;
                    
                    const mKilos = rep.merma_kilogramos || rep.Merma_Kilos;
                    const mP = mKilos ? parseFloat(mKilos) : 0; 

                    const costoUnitarioCalculado = op === "INGRESO" && uP > 0 ? `S/ ${(total / uP).toFixed(2)}` : "-";
                    const costoKgCalculado = op === "INGRESO" && kP > 0 ? `S/ ${(total / kP).toFixed(2)}` : "-";

                    return (
                      <tr key={idx} style={{ borderBottom: '1px solid #f1f5f9', color: '#334155' }}>
                        <td style={{ padding: '8px 10px' }}>{idMov}</td>
                        <td style={{ padding: '8px 10px', fontWeight: '600' }}>{fechaStr}</td>
                        <td style={{ padding: '8px 10px', fontWeight: '700', color: '#1e3a8a' }}>{localOrigen}</td>
                        <td>
                          <span style={{ 
                            backgroundColor: op === 'INGRESO' ? '#dcfce7' : op === 'PRESTAMO' ? '#ffedd5' : op === 'DEVOLUCION' ? '#e0f2fe' : '#fee2e2', 
                            color: op === 'INGRESO' ? '#15803d' : op === 'PRESTAMO' ? '#c2410c' : op === 'DEVOLUCION' ? '#0369a1' : '#b91c1c', 
                            padding: '2px 6px', borderRadius: '4px', fontSize: '11px', fontWeight: '800' 
                          }}>{op}</span>
                        </td>
                        <td><span style={{ backgroundColor: area === 'HORNO' ? '#ffedd5' : area === 'BAR' ? '#e0f2fe' : '#f1f5f9', color: area === 'HORNO' ? '#c2410c' : '#475569', padding: '2px 6px', borderRadius: '4px', fontSize: '10px', fontWeight: 'bold' }}>{area}</span></td>
                        <td style={{ padding: '8px 10px', fontWeight: '600' }}>{nombreInsumo}</td>
                        <td style={{ padding: '8px 10px', textAlign: 'right' }}>{formatStockNumber(uP)}</td>
                        <td style={{ padding: '8px 10px', textAlign: 'right' }}>{kP.toFixed(3)}</td>
                        <td style={{ padding: '8px 10px' }}>{rep.Destino || '-'}</td>
                        
                        {usuarioLogueado.id_rol === 1 && (
                          <td style={{ padding: '8px 10px', textAlign: 'right', fontWeight: 'bold', color: mP > 0 ? '#ef4444' : '#64748b' }}>
                            {mP > 0 ? `${mP.toFixed(3)} Kg` : '-'}
                          </td>
                        )}

                        {usuarioLogueado.id_rol === 1 && (
                          <>
                            <td style={{ padding: '8px 10px', textAlign: 'right', color: '#0d9488', fontWeight: '600' }}>{costoUnitarioCalculado}</td>
                            <td style={{ padding: '8px 10px', textAlign: 'right', color: '#b45309', fontWeight: '600' }}>{costoKgCalculado}</td>
                            <td style={{ padding: '4px 12px', textAlign: 'right', backgroundColor: '#f0fdfa', fontWeight: 'bold', color: '#0d9488' }}>
                              {op === "INGRESO" && total === 0 ? (
                                <div style={{ display: 'flex', alignItems: 'center', gap: '4px', justifyContent: 'flex-end' }}>
                                  <input type="number" placeholder="S/ 0.00" value={costosEditables[idMov] || ""} onChange={(e) => setCostosEditables({ ...costosEditables, [idMov]: e.target.value })} onKeyDown={(e) => handleKeyDownCosto(e, idMov)} style={{ width: '65px', padding: '2px', textAlign: 'right' }} />
                                  <button onClick={() => ejecutarGuardadoCosto(idMov)} style={{ padding: '2px 4px', backgroundColor: '#0d9488', color: 'white', border: 'none', borderRadius: '4px' }}>💾</button>
                                </div>
                              ) : (total > 0 ? `S/ ${total.toFixed(2)}` : '-')}
                            </td>
                          </>
                        )}
                        
                        <td style={{ padding: '8px 10px', color: '#475569' }}>{txtComentario ? txtComentario : <span style={{ color: '#94a3b8', fontStyle: 'italic' }}>-</span>}</td>
                        <td style={{ padding: '8px 10px' }}>{rep.Encargado || rep.nombre_completo}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export default App;
