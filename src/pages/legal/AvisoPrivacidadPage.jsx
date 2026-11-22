// src/pages/legal/AvisoPrivacidadPage.jsx
// Aviso de Privacidad conforme a la LFPDPPP — Cervezas Finas de Ciudad Serdán S.A. de C.V.
import React from 'react';
import { Helmet } from 'react-helmet-async';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { ChevronLeft, Shield, Eye, Database, Lock, UserCheck, AlertTriangle } from 'lucide-react';

const LAST_UPDATED = '28 de octubre de 2026';
const COMPANY_NAME = 'Cervezas Finas de Ciudad Serdán S.A. de C.V.';
const COMPANY_SHORT = 'Cervezas Finas';
const DOMICILIO = 'Calle Hidalgo No. 100, Ciudad Serdán, Puebla, México, C.P. 75520';
const CORREO_ARCO = 'privacidad@cervezasfinas.com.mx';
const CORREO_GENERAL = 'legal@cervezasfinas.com.mx';

function Section({ icon: Icon, title, children }) {
  return (
    <motion.section
      initial={{ opacity: 0, y: 16 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true }}
      transition={{ duration: 0.45 }}
      className="mb-10"
    >
      <div className="flex items-center gap-3 mb-4">
        <div className="p-2 rounded-xl bg-blue-500/10 border border-blue-500/20">
          <Icon className="w-5 h-5 text-blue-400" />
        </div>
        <h2 className="text-xl font-bold text-white">{title}</h2>
      </div>
      <div className="text-slate-300 leading-relaxed space-y-3 text-[15px] pl-1">
        {children}
      </div>
    </motion.section>
  );
}

function Li({ children }) {
  return (
    <li className="flex gap-2">
      <span className="text-blue-400 mt-1 shrink-0">›</span>
      <span>{children}</span>
    </li>
  );
}

export default function AvisoPrivacidadPage() {
  const navigate = useNavigate();

  return (
    <div className="min-h-screen bg-gradient-to-br from-[#03060C] via-slate-900 to-[#03060C] text-slate-100">
      <Helmet>
        <title>Aviso de Privacidad | Cervezas Finas</title>
        <meta name="description" content="Aviso de privacidad de Cervezas Finas de Ciudad Serdán conforme a la LFPDPPP." />
        <meta name="robots" content="noindex, nofollow" />
      </Helmet>

      {/* Header / Back */}
      <div className="sticky top-0 z-50 bg-[#03060C]/90 backdrop-blur-xl border-b border-white/10">
        <div className="max-w-4xl mx-auto px-4 py-3 flex items-center gap-3">
          <button
            onClick={() => navigate(-1)}
            className="flex items-center gap-2 text-sm text-slate-400 hover:text-white transition-colors group"
          >
            <ChevronLeft className="w-4 h-4 group-hover:-translate-x-0.5 transition-transform" />
            Regresar
          </button>
          <div className="h-4 w-px bg-white/20" />
          <span className="text-xs text-slate-500 font-medium uppercase tracking-widest">Aviso de Privacidad</span>
        </div>
      </div>

      {/* Hero */}
      <div className="relative overflow-hidden border-b border-white/10 py-14 px-6 text-center bg-gradient-to-r from-blue-950/40 via-slate-900 to-indigo-950/30">
        <motion.div initial={{ opacity: 0, y: -16 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.6 }}>
          <div className="flex items-center justify-center gap-2 mb-3">
            <Shield className="w-6 h-6 text-blue-400" />
            <span className="text-blue-400 text-sm font-semibold uppercase tracking-widest">Protección de Datos</span>
          </div>
          <h1 className="text-3xl md:text-4xl font-extrabold text-white mb-3">Aviso de Privacidad</h1>
          <p className="text-slate-400 text-sm">
            {COMPANY_NAME}<br />
            <span className="text-slate-500">Última actualización: {LAST_UPDATED}</span>
          </p>
        </motion.div>
      </div>

      {/* Content */}
      <div className="max-w-4xl mx-auto px-4 md:px-8 py-12">

        {/* Intro legal */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.2 }}
          className="bg-blue-500/8 border border-blue-500/20 rounded-2xl p-5 mb-10 text-sm text-blue-200 leading-relaxed"
        >
          <strong className="text-blue-300 flex items-center gap-2 mb-2">
            <AlertTriangle className="w-4 h-4" />
            Aviso de Privacidad Integral
          </strong>
          El presente Aviso de Privacidad se emite en cumplimiento de lo dispuesto por la{' '}
          <strong>Ley Federal de Protección de Datos Personales en Posesión de los Particulares (LFPDPPP)</strong>,
          su Reglamento, y los Lineamientos del Aviso de Privacidad emitidos por el INAI.
        </motion.div>

        {/* 1. Responsable */}
        <Section icon={UserCheck} title="1. Identidad y Domicilio del Responsable">
          <p>
            <strong className="text-white">{COMPANY_NAME}</strong> (en adelante <em>"la Empresa"</em> o{' '}
            <em>"el Responsable"</em>), con domicilio en{' '}
            <strong className="text-white">{DOMICILIO}</strong>, es el Responsable del tratamiento de sus datos
            personales.
          </p>
          <p>
            Para asuntos relacionados con el tratamiento de sus datos personales, puede contactarnos en:{' '}
            <a href={`mailto:${CORREO_ARCO}`} className="text-blue-400 underline hover:text-blue-300">{CORREO_ARCO}</a>
          </p>
        </Section>

        {/* 2. Datos que recabamos */}
        <Section icon={Database} title="2. Datos Personales Recabados">
          <p>Dependiendo de la relación que usted mantenga con la Empresa, podemos recabar los siguientes datos:</p>

          <div className="mt-3 space-y-4">
            <div className="bg-white/[0.04] rounded-xl p-4 border border-white/10">
              <p className="text-white font-semibold mb-2">A) Candidatos a Empleo</p>
              <ul className="space-y-1 list-none">
                <Li>Nombre completo, fotografía, fecha de nacimiento, género.</Li>
                <Li>CURP, RFC, NSS (Número de Seguridad Social).</Li>
                <Li>Domicilio, correo electrónico, número telefónico.</Li>
                <Li>Historial laboral, educativo y referencias profesionales.</Li>
                <Li>Carta de no antecedentes penales (si aplica al puesto).</Li>
                <Li>Datos bancarios (exclusivamente en caso de contratación para pago de nómina).</Li>
              </ul>
            </div>

            <div className="bg-white/[0.04] rounded-xl p-4 border border-white/10">
              <p className="text-white font-semibold mb-2">B) Colaboradores Activos</p>
              <ul className="space-y-1 list-none">
                <Li>Todos los datos mencionados en el apartado A.</Li>
                <Li>Datos de salud (para IMSS, permisos médicos, seguros de vida o gastos médicos).</Li>
                <Li>Geolocalización y registros de actividad dentro del sistema (ruta, visitas, pedidos).</Li>
                <Li>Datos biométricos: registro de asistencia (en instalaciones que cuenten con ese sistema).</Li>
                <Li>Imágenes de videovigilancia en instalaciones de la Empresa.</Li>
                <Li>Comunicaciones realizadas a través de los canales corporativos (correo, mensajería interna).</Li>
              </ul>
            </div>

            <div className="bg-white/[0.04] rounded-xl p-4 border border-white/10">
              <p className="text-white font-semibold mb-2">C) Clientes y Usuarios de la Tienda Digital (Shop)</p>
              <ul className="space-y-1 list-none">
                <Li>Código de cliente asignado, nombre comercial, RFC y Constancia de Situación Fiscal (CFDI 4.0).</Li>
                <Li>Datos de contacto y logística: nombre del titular, teléfono celular (WhatsApp y llamadas de televenta/reparto), dirección física de entrega y geolocalización.</Li>
                <Li>Acreditación de mayoría de edad (+18) conforme al Art. 220 de la Ley General de Salud.</Li>
                <Li>Historial de pedidos, control de envases retornables, canjes y saldo de puntos de lealtad.</Li>
                <Li>Registros fotográficos del enfriador y material POP subidos para acreditación de puntos.</Li>
                <Li>Tokens de notificaciones push de Firebase (FCM) para alertas de pedidos, entregas y televenta.</Li>
              </ul>
            </div>
          </div>

          <p className="mt-4 p-3 bg-amber-500/10 rounded-xl border border-amber-500/20 text-amber-200 text-sm">
            <strong>Datos Sensibles:</strong> Cuando sea estrictamente necesario, la Empresa puede recabar datos
            de salud de colaboradores para cumplir obligaciones laborales y de seguridad social. El titular deberá
            otorgar su consentimiento expreso y por escrito para el tratamiento de este tipo de datos.
          </p>
        </Section>

        {/* 3. Finalidades */}
        <Section icon={Eye} title="3. Finalidades del Tratamiento">
          <div className="space-y-4">
            <div>
              <p className="text-white font-semibold mb-2">Finalidades Primarias (necesarias para la relación jurídica):</p>
              <ul className="space-y-2 list-none">
                <Li>Evaluación y selección de candidatos en procesos de reclutamiento.</Li>
                <Li>Gestión de la relación laboral: nómina, prestaciones, IMSS, INFONAVIT, SAR.</Li>
                <Li>Operación del sistema interno: gestión de rutas, pedidos, visitas, canjes e inventarios.</Li>
                <Li>Cumplimiento de obligaciones fiscales, contables y legales ante autoridades.</Li>
                <Li>Prestación de servicios de distribución y comercialización a clientes.</Li>
                <Li>Administración del programa de puntos y canjes para clientes.</Li>
                <Li>Control de acceso a instalaciones y seguridad patrimonial.</Li>
                <Li>Monitoreo de productividad y cumplimiento de metas laborales.</Li>
              </ul>
            </div>

            <div>
              <p className="text-white font-semibold mb-2">Finalidades Secundarias (puede oponerse a ellas):</p>
              <ul className="space-y-2 list-none">
                <Li>Envío de comunicaciones comerciales, promociones y novedades de la Empresa o de Heineken México.</Li>
                <Li>Análisis estadísticos y estudios de mercado internos.</Li>
                <Li>Evaluación de satisfacción laboral y clima organizacional.</Li>
              </ul>
            </div>
          </div>
        </Section>

        {/* 4. Transferencias */}
        <Section icon={Database} title="4. Transferencias de Datos Personales">
          <p>
            Sus datos personales podrán ser transferidos a terceros en los siguientes supuestos, sin que se requiera
            su consentimiento conforme al Artículo 37 de la LFPDPPP:
          </p>
          <ul className="space-y-2 list-none mt-2">
            <Li><strong className="text-white">Heineken México, S.A. de C.V.</strong> — en calidad de empresa principal del esquema de distribución autorizada, para auditorías, reportes de ventas y cumplimiento de políticas comerciales.</Li>
            <Li><strong className="text-white">IMSS, SAT, INFONAVIT y demás autoridades gubernamentales</strong> — para el cumplimiento de obligaciones fiscales y de seguridad social.</Li>
            <Li><strong className="text-white">Proveedores de nómina, contabilidad y tecnología</strong> — que actúan como Encargados del Tratamiento bajo instrucciones de la Empresa y con obligaciones de confidencialidad.</Li>
            <Li><strong className="text-white">Despachos legales o autoridades judiciales</strong> — cuando sea necesario para el ejercicio o defensa de derechos en procedimientos legales.</Li>
          </ul>
          <p className="mt-3">
            Para cualquier transferencia que requiera su consentimiento, se lo solicitaremos de manera expresa previa al tratamiento.
          </p>
          <p className="mt-2 text-sm text-slate-400">
            <strong className="text-slate-300">Proveedor de nube:</strong> Los datos se almacenan en servidores de Supabase Inc. (PostgreSQL gestionado, con centros de datos en Estados Unidos) y Hostinger International Ltd. (servidores en México/Lituania). Dichos proveedores cuentan con medidas de seguridad adecuadas y se rigen por sus propias políticas de privacidad y los marcos legales aplicables.
          </p>
        </Section>

        {/* 5. Derechos ARCO */}
        <Section icon={UserCheck} title="5. Derechos ARCO y Cómo Ejercerlos">
          <p>
            Usted tiene derecho a:
          </p>
          <ul className="space-y-2 list-none mt-2">
            <Li><strong className="text-white">Acceso:</strong> Conocer qué datos personales tenemos de usted y cómo los tratamos.</Li>
            <Li><strong className="text-white">Rectificación:</strong> Solicitar la corrección de datos inexactos o incompletos.</Li>
            <Li><strong className="text-white">Cancelación:</strong> Solicitar la supresión de sus datos cuando considere que no son necesarios para las finalidades que justificaron su obtención.</Li>
            <Li><strong className="text-white">Oposición:</strong> Oponerse al tratamiento de sus datos para finalidades específicas.</Li>
            <Li><strong className="text-white">Revocación del consentimiento:</strong> Revocar el consentimiento otorgado, sin efectos retroactivos.</Li>
            <Li><strong className="text-white">Portabilidad:</strong> Obtener una copia de sus datos en formato electrónico interoperable.</Li>
            <Li><strong className="text-white">Limitación del uso:</strong> Solicitar que se limite el tratamiento de sus datos a finalidades específicas.</Li>
          </ul>
          <div className="mt-4 bg-white/[0.04] rounded-xl p-4 border border-white/10">
            <p className="text-white font-semibold mb-2">Procedimiento para ejercer sus derechos ARCO:</p>
            <p>Envíe su solicitud a <a href={`mailto:${CORREO_ARCO}`} className="text-blue-400 underline hover:text-blue-300">{CORREO_ARCO}</a> indicando:</p>
            <ul className="space-y-1 list-none mt-2">
              <Li>Nombre completo y datos de contacto del titular.</Li>
              <Li>Copia de identificación oficial vigente (INE, pasaporte).</Li>
              <Li>Descripción clara del derecho que desea ejercer y los datos involucrados.</Li>
              <Li>Cualquier otro elemento que facilite la localización de sus datos.</Li>
            </ul>
            <p className="mt-3 text-sm text-slate-400">
              La Empresa responderá en un plazo máximo de <strong className="text-slate-300">20 días hábiles</strong> a partir de la recepción de su solicitud. Si procede, los cambios se realizarán en los siguientes <strong className="text-slate-300">15 días hábiles</strong>.
            </p>
          </div>
        </Section>

        {/* 6. Cookies y tecnologías de rastreo */}
        <Section icon={Eye} title="6. Cookies y Tecnologías de Rastreo">
          <p>
            Nuestras plataformas digitales pueden utilizar cookies y tecnologías similares para:
          </p>
          <ul className="space-y-2 list-none mt-2">
            <Li><strong className="text-white">Cookies esenciales:</strong> Necesarias para el funcionamiento del sistema (sesión, autenticación, seguridad). No pueden desactivarse.</Li>
            <Li><strong className="text-white">Cookies de rendimiento:</strong> Nos permiten analizar el uso de la plataforma para mejorar su funcionamiento (estadísticas anónimas).</Li>
            <Li><strong className="text-white">Almacenamiento local (localStorage / IndexedDB):</strong> Utilizado para sincronización offline y caché de datos de la aplicación.</Li>
            <Li><strong className="text-white">Service Workers:</strong> Utilizados para habilitar funcionalidad offline y notificaciones push (únicamente si el usuario otorgó permiso).</Li>
          </ul>
          <p className="mt-3 text-sm text-slate-400">
            Los usuarios del sistema interno pueden gestionar los permisos de notificaciones desde la configuración de su navegador o dispositivo móvil.
          </p>
        </Section>

        {/* 7. Seguridad */}
        <Section icon={Lock} title="7. Medidas de Seguridad">
          <p>
            La Empresa implementa las siguientes medidas para proteger sus datos personales:
          </p>
          <ul className="space-y-2 list-none mt-2">
            <Li>Cifrado en tránsito mediante <strong className="text-white">TLS 1.2/1.3 (HTTPS)</strong> en todas las comunicaciones.</Li>
            <Li>Control de accesos por roles y privilegios mínimos necesarios (<strong className="text-white">RBAC</strong>).</Li>
            <Li>Autenticación segura con gestión centralizada de sesiones y tokens (<strong className="text-white">JWT / Supabase Auth</strong>).</Li>
            <Li>Copias de seguridad periódicas y encriptadas.</Li>
            <Li>Monitoreo de actividad y registros de auditoría (<strong className="text-white">audit logs</strong>).</Li>
            <Li>Formación y concienciación del personal en materia de protección de datos.</Li>
            <Li>Políticas de acceso físico a instalaciones donde se resguarda información.</Li>
          </ul>
        </Section>

        {/* 8. Menores de edad */}
        <Section icon={Shield} title="8. Menores de Edad">
          <p>
            Los servicios de la Empresa están dirigidos a personas mayores de <strong className="text-white">18 años</strong>.
            La Empresa no recaba intencionalmente datos personales de menores de edad. Si detectamos que hemos
            recopilado datos de un menor sin el consentimiento de sus padres o tutores, procederemos a
            eliminarlos de forma inmediata.
          </p>
          <p>
            Si usted es padre o tutor y tiene conocimiento de que su hijo nos ha proporcionado datos personales,
            contáctenos en <a href={`mailto:${CORREO_ARCO}`} className="text-blue-400 underline hover:text-blue-300">{CORREO_ARCO}</a>.
          </p>
        </Section>

        {/* 9. Cambios */}
        <Section icon={Database} title="9. Cambios al Aviso de Privacidad">
          <p>
            El presente Aviso de Privacidad puede ser actualizado periódicamente para reflejar cambios en nuestras
            prácticas de tratamiento de datos, en la legislación aplicable o en los servicios que ofrecemos.
          </p>
          <p>
            Las modificaciones se publicarán en este mismo espacio indicando la fecha de actualización. Para
            cambios sustanciales que afecten el tratamiento de datos sensibles o que requieran nuevo consentimiento,
            notificaremos a los titulares afectados por los medios disponibles.
          </p>
        </Section>

        {/* 10. INAI */}
        <Section icon={UserCheck} title="10. Derecho de Acudir ante el INAI">
          <p>
            Si considera que su derecho a la protección de datos personales ha sido vulnerado por alguna conducta
            u omisión de la Empresa, o si considera que hubo una respuesta insatisfactoria a su solicitud ARCO,
            tiene derecho a acudir al{' '}
            <strong className="text-white">
              Instituto Nacional de Transparencia, Acceso a la Información y Protección de Datos Personales (INAI)
            </strong>{' '}
            para interponer la queja o denuncia correspondiente.
          </p>
          <p>
            Sitio web del INAI: <a href="https://www.inai.org.mx" target="_blank" rel="noopener noreferrer" className="text-blue-400 underline hover:text-blue-300">www.inai.org.mx</a>
          </p>
        </Section>

        {/* Contacto */}
        <div className="mt-12 border border-white/10 rounded-2xl p-6 bg-white/[0.03] text-center">
          <p className="text-slate-400 text-sm mb-1">Departamento de Datos Personales</p>
          <a href={`mailto:${CORREO_ARCO}`} className="text-blue-400 font-semibold hover:text-blue-300 transition-colors text-sm">
            {CORREO_ARCO}
          </a>
          <p className="text-slate-600 text-xs mt-3">{DOMICILIO}</p>
          <p className="text-slate-600 text-xs mt-1">© {new Date().getFullYear()} {COMPANY_NAME}. Todos los derechos reservados.</p>
          <div className="mt-4 pt-4 border-t border-white/10">
            <button
              onClick={() => navigate('/terminos')}
              className="text-xs text-slate-500 hover:text-slate-300 transition-colors underline"
            >
              Ver Términos y Condiciones
            </button>
          </div>
        </div>

        <div className="mt-8 text-center">
          <button
            onClick={() => navigate(-1)}
            className="inline-flex items-center gap-2 text-slate-500 hover:text-slate-300 text-sm transition-colors"
          >
            <ChevronLeft className="w-4 h-4" />
            Regresar
          </button>
        </div>
      </div>
    </div>
  );
}
