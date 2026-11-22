// src/pages/legal/TerminosPage.jsx
// Términos y Condiciones legales de Cervezas Finas de Ciudad Serdán S.A. de C.V.
import React from 'react';
import { Helmet } from 'react-helmet-async';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { ChevronLeft, Shield, FileText, AlertTriangle, Scale, Lock, Globe, ShoppingBag, RotateCcw } from 'lucide-react';

const LAST_UPDATED = '28 de octubre de 2026';
const COMPANY_NAME = 'Cervezas Finas de Ciudad Serdán S.A. de C.V.';
const COMPANY_SHORT = 'Cervezas Finas';
const RFC = 'CFCS-XXXXXXXX'; // Actualizar con RFC real
const DOMICILIO = 'Calle Hidalgo No. 100, Ciudad Serdán, Puebla, México, C.P. 75520';
const CORREO = 'legal@cervezasfinas.com.mx';

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
        <div className="p-2 rounded-xl bg-emerald-500/10 border border-emerald-500/20">
          <Icon className="w-5 h-5 text-emerald-400" />
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
      <span className="text-emerald-400 mt-1 shrink-0">›</span>
      <span>{children}</span>
    </li>
  );
}

export default function TerminosPage() {
  const navigate = useNavigate();

  return (
    <div className="min-h-screen bg-gradient-to-br from-[#03060C] via-slate-900 to-[#03060C] text-slate-100">
      <Helmet>
        <title>Términos y Condiciones | Cervezas Finas</title>
        <meta name="description" content="Términos y condiciones de uso del sistema interno y portal web de Cervezas Finas de Ciudad Serdán." />
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
          <span className="text-xs text-slate-500 font-medium uppercase tracking-widest">Términos y Condiciones</span>
        </div>
      </div>

      {/* Hero */}
      <div className="relative overflow-hidden border-b border-white/10 py-14 px-6 text-center bg-gradient-to-r from-emerald-950/40 via-slate-900 to-blue-950/30">
        <motion.div initial={{ opacity: 0, y: -16 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.6 }}>
          <div className="flex items-center justify-center gap-2 mb-3">
            <Scale className="w-6 h-6 text-emerald-400" />
            <span className="text-emerald-400 text-sm font-semibold uppercase tracking-widest">Documento Legal</span>
          </div>
          <h1 className="text-3xl md:text-4xl font-extrabold text-white mb-3">Términos y Condiciones</h1>
          <p className="text-slate-400 text-sm">
            {COMPANY_NAME}<br />
            <span className="text-slate-500">Última actualización: {LAST_UPDATED}</span>
          </p>
        </motion.div>
      </div>

      {/* Content */}
      <div className="max-w-4xl mx-auto px-4 md:px-8 py-12">

        {/* Intro */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.2 }}
          className="bg-amber-500/8 border border-amber-500/20 rounded-2xl p-5 mb-10 text-sm text-amber-200 leading-relaxed"
        >
          <strong className="text-amber-300 flex items-center gap-2 mb-2">
            <AlertTriangle className="w-4 h-4" />
            Aviso importante — Lea antes de continuar
          </strong>
          Al acceder, navegar o utilizar cualquier servicio, plataforma o sistema digital de{' '}
          <strong>{COMPANY_NAME}</strong> — incluyendo el portal web, la aplicación móvil, el sistema interno de
          gestión y la bolsa de trabajo — usted acepta, sin reserva alguna, los presentes Términos y Condiciones
          en su totalidad. Si no está de acuerdo, deberá abstenerse de usar los servicios de manera inmediata.
        </motion.div>

        {/* 1. Identificación del Responsable */}
        <Section icon={FileText} title="1. Identificación del Responsable">
          <p>
            <strong className="text-white">{COMPANY_NAME}</strong> (en adelante, <em>"la Empresa"</em>) es una
            persona moral constituida conforme a las leyes de los Estados Unidos Mexicanos, con domicilio en{' '}
            <strong className="text-white">{DOMICILIO}</strong>, distribuidora autorizada de Heineken México, S.A.
            de C.V.
          </p>
          <p>
            Para contacto relacionado con estos Términos: <a href={`mailto:${CORREO}`} className="text-emerald-400 underline hover:text-emerald-300">{CORREO}</a>
          </p>
        </Section>

        {/* 2. Objeto y Alcance */}
        <Section icon={Globe} title="2. Objeto y Alcance">
          <p>
            Los presentes Términos y Condiciones regulan el acceso y uso de:
          </p>
          <ul className="space-y-2 list-none mt-2">
            <Li>El <strong className="text-white">Sistema Interno de Gestión</strong> (plataforma web y app móvil para colaboradores).</Li>
            <Li>La <strong className="text-white">Tienda Digital y App de Clientes</strong> (pedidos B2B, catálogo y programa de lealtad).</Li>
            <Li>El <strong className="text-white">Portal de Bolsa de Trabajo</strong> para candidatos externos.</Li>
            <Li>El <strong className="text-white">Portal Público</strong> de información corporativa y portafolio de productos.</Li>
            <Li>Cualquier API, servicio o herramienta digital que la Empresa ponga a disposición en el futuro.</Li>
          </ul>
          <p className="mt-3">
            Estos Términos son aplicables a todos los usuarios, sean colaboradores, candidatos, clientes o visitantes.
          </p>
        </Section>

        {/* 3. Condiciones de Acceso */}
        <Section icon={Lock} title="3. Condiciones de Acceso y Uso Aceptable">
          <p>El usuario se compromete a:</p>
          <ul className="space-y-2 list-none mt-2">
            <Li>Proporcionar información <strong className="text-white">veraz, completa y actualizada</strong> al momento de registrarse o postularse.</Li>
            <Li>No compartir sus credenciales de acceso con terceros. Cada cuenta es personal e intransferible.</Li>
            <Li>No realizar actividades que interfieran, dañen, deterioren o sobrecarguen los sistemas de la Empresa.</Li>
            <Li>No intentar acceder sin autorización a módulos, bases de datos, APIs o recursos restringidos.</Li>
            <Li>No utilizar la plataforma para fines ilícitos, fraudulentos, difamatorios o contrarios a la moral.</Li>
            <Li>No reproducir, copiar, distribuir ni comercializar el software, diseños o contenidos sin consentimiento escrito previo de la Empresa.</Li>
            <Li>No realizar ingeniería inversa, descompilación ni alteración del código fuente de los sistemas.</Li>
          </ul>
          <p className="mt-3 text-amber-300">
            El incumplimiento de cualquiera de los puntos anteriores faculta a la Empresa a suspender o cancelar el acceso de manera inmediata y, en su caso, ejercer las acciones legales correspondientes.
          </p>
        </Section>

        {/* 4. Cuentas de Colaboradores */}
        <Section icon={Shield} title="4. Cuentas de Colaboradores y Sistema Interno">
          <p>
            Las cuentas del sistema interno son otorgadas exclusivamente a colaboradores activos de{' '}
            <strong className="text-white">{COMPANY_SHORT}</strong>. Al recibir una cuenta, el colaborador acepta que:
          </p>
          <ul className="space-y-2 list-none mt-2">
            <Li>Su actividad dentro del sistema puede ser monitoreada y auditada con fines operativos y de cumplimiento.</Li>
            <Li>La información registrada en el sistema (pedidos, visitas, canjes, rutas, asistencias, etc.) constituye información empresarial confidencial.</Li>
            <Li>Queda estrictamente prohibido compartir, exportar o divulgar datos de clientes, precios, rutas o cualquier información interna a terceros ajenos a la empresa.</Li>
            <Li>Al término de la relación laboral, el acceso será revocado de forma inmediata y el colaborador deberá cesar todo uso de la plataforma.</Li>
            <Li>La cuenta no podrá ser utilizada para actividades ajenas a las funciones del puesto.</Li>
          </ul>
        </Section>

        {/* 5. Propiedad Intelectual */}
        <Section icon={FileText} title="5. Propiedad Intelectual">
          <p>
            Todo el contenido de la plataforma — incluyendo, de manera enunciativa mas no limitativa, el código fuente,
            diseño, logotipos, textos, fotografías, bases de datos, flujos de trabajo y funcionalidades — es propiedad
            exclusiva de <strong className="text-white">{COMPANY_NAME}</strong> o de sus proveedores de tecnología y
            está protegido por las leyes de Propiedad Intelectual de México y los tratados internacionales aplicables.
          </p>
          <p>
            Los logotipos y marcas de <strong className="text-white">Heineken México, S.A. de C.V.</strong> (Heineken,
            Sol, Tecate, Dos Equis, Bohemia, entre otras) son marcas registradas de sus respectivos titulares y se usan
            en el marco del contrato de distribución autorizada. Su reproducción no autorizada está prohibida.
          </p>
          <p>
            Se otorga una <strong className="text-white">licencia limitada, personal, no exclusiva e intransferible</strong> para
            usar la plataforma estrictamente para los fines para los que fue diseñada. Esta licencia no implica cesión
            de derechos de ningún tipo.
          </p>
        </Section>

        {/* 6. Portal de Bolsa de Trabajo */}
        <Section icon={FileText} title="6. Portal de Bolsa de Trabajo — Candidatos Externos">
          <p>
            Al postularse a una vacante, el candidato declara y acepta que:
          </p>
          <ul className="space-y-2 list-none mt-2">
            <Li>La información proporcionada (datos personales, CV, referencias) es <strong className="text-white">verídica</strong>. Cualquier falsedad faculta a la Empresa a descalificar la candidatura en cualquier etapa del proceso.</Li>
            <Li>Sus datos serán tratados conforme al <strong className="text-white">Aviso de Privacidad</strong> de la Empresa.</Li>
            <Li>La publicación de una vacante no constituye una oferta de empleo ni garantiza la contratación.</Li>
            <Li>La Empresa se reserva el derecho de cancelar o modificar vacantes en cualquier momento sin previo aviso.</Li>
            <Li>El proceso de selección puede incluir evaluaciones, entrevistas, verificaciones de referencias y/o antecedentes.</Li>
            <Li>La Empresa no cobra ningún tipo de cuota o pago a los candidatos en ninguna etapa del proceso de reclutamiento.</Li>
          </ul>
          <p className="mt-3 text-amber-300">
            La Empresa no discrimina por motivos de género, edad, raza, religión, discapacidad, orientación sexual, estado civil u origen étnico. El proceso de selección se basa en mérito, competencias y experiencia.
          </p>
        </Section>

        {/* 7. Tienda Digital y Venta de Bebidas Alcohólicas (+18) */}
        <Section icon={ShoppingBag} title="7. Tienda Digital, Comercio Electrónico y Bebidas Alcohólicas (+18)">
          <div className="p-4 bg-amber-500/10 border border-amber-500/30 rounded-xl text-amber-200 text-xs mb-3">
            <strong className="text-amber-300 block mb-1">ADVERTENCIA SANITARIA OFICIAL (NOM-142-SSA1/SCFI-2014 Y ART. 220 LEY GENERAL DE SALUD)</strong>
            El abuso en el consumo de este producto es nocivo para la salud. Prohibida la venta a menores de 18 años. No conducir bajo el influjo del alcohol.
          </div>
          <p>
            Las compras efectuadas a través de la Tienda Digital se rigen por la Ley Federal de Protección al Consumidor (Capítulo VIII BIS) y las siguientes condiciones obligatorias:
          </p>
          <ul className="space-y-2 list-none mt-2">
            <Li><strong className="text-white">Mayoría de edad estricta (+18):</strong> Todo usuario declara tener más de 18 años. Al entregar el pedido, el receptor debe presentar identificación oficial vigente (INE o Pasaporte). Si no se acredita la mayoría de edad, el pedido no será entregado.</Li>
            <Li><strong className="text-white">Precios e Impuestos:</strong> Precios en MXN con IVA y el Impuesto Especial sobre Producción y Servicios (IEPS) correspondiente incluidos.</Li>
            <Li><strong className="text-white">Envases Retornables:</strong> Las presentaciones retornables requieren el intercambio físico 1 a 1 de envases limpios e íntegros de igual calibre y marca autorizada de Heineken México.</Li>
            <Li><strong className="text-white">Programa de Lealtad y Puntos:</strong> Los puntos carecen de valor monetario en efectivo y no son transferibles ni canjeables por dinero. Las fotos de enfriadores son auditadas rigurosamente; fotos falsas conllevan la anulación inmediata de puntos acumulados.</Li>
          </ul>
        </Section>

        {/* 8. Limitación de Responsabilidad */}
        <Section icon={AlertTriangle} title="8. Limitación de Responsabilidad">
          <p>
            En la máxima medida permitida por la ley mexicana:
          </p>
          <ul className="space-y-2 list-none mt-2">
            <Li>La Empresa <strong className="text-white">no garantiza</strong> la disponibilidad ininterrumpida de los sistemas. Podrán existir periodos de mantenimiento o interrupciones por causas técnicas o de fuerza mayor.</Li>
            <Li>La Empresa no será responsable por daños directos, indirectos, incidentales, especiales o consecuentes derivados del uso o la imposibilidad de uso de la plataforma.</Li>
            <Li>La Empresa no responde por errores de conectividad, fallos de terceros (proveedores de hosting, servicios cloud, operadoras de telecomunicaciones) o ataques informáticos fuera de su control razonable.</Li>
            <Li>La Empresa no es responsable por el contenido publicado por terceros en plataformas externas que enlacen a sus sistemas.</Li>
          </ul>
          <p className="mt-3">
            La responsabilidad máxima de la Empresa frente a cualquier reclamación vinculada al uso de la plataforma no excederá la cantidad de <strong className="text-white">$0.00 MXN</strong>, dado que el acceso a la mayoría de los servicios es gratuito. En caso de servicios con contraprestación, la responsabilidad máxima será el monto efectivamente pagado en los últimos 12 meses.
          </p>
        </Section>

        {/* 8. Seguridad de la Información */}
        <Section icon={Lock} title="8. Seguridad de la Información">
          <p>
            La Empresa implementa medidas técnicas y organizativas razonables para proteger la información almacenada
            en sus sistemas, incluyendo cifrado en tránsito (TLS/HTTPS), control de accesos basado en roles (RBAC),
            autenticación segura y monitoreo de actividad.
          </p>
          <p>
            No obstante, ningún sistema de seguridad es infalible. En caso de detectar un incidente de seguridad que
            afecte datos personales, la Empresa notificará a los titulares afectados conforme a lo dispuesto en la{' '}
            <strong className="text-white">Ley Federal de Protección de Datos Personales en Posesión de los Particulares (LFPDPPP)</strong>.
          </p>
          <p>
            Si el usuario detecta una vulnerabilidad o actividad sospechosa, debe reportarla de inmediato a{' '}
            <a href={`mailto:${CORREO}`} className="text-emerald-400 underline hover:text-emerald-300">{CORREO}</a>.
          </p>
        </Section>

        {/* 9. Datos Personales y Privacidad */}
        <Section icon={Shield} title="9. Datos Personales y Privacidad">
          <p>
            El tratamiento de datos personales se rige por el{' '}
            <button
              onClick={() => navigate('/aviso-privacidad')}
              className="text-emerald-400 underline hover:text-emerald-300 font-semibold"
            >
              Aviso de Privacidad
            </button>{' '}
            de la Empresa, disponible en <strong className="text-white">/aviso-privacidad</strong>, el cual forma
            parte integral de los presentes Términos y Condiciones.
          </p>
          <p>
            La Empresa actúa como <strong className="text-white">Responsable del Tratamiento</strong> en los términos
            de la <strong className="text-white">LFPDPPP</strong> y su Reglamento. Los usuarios tienen reconocidos
            los derechos <strong className="text-white">ARCO</strong> (Acceso, Rectificación, Cancelación y Oposición)
            ejercibles a través de los canales indicados en dicho Aviso.
          </p>
        </Section>

        {/* 10. Modificaciones */}
        <Section icon={FileText} title="10. Modificaciones a los Términos">
          <p>
            La Empresa se reserva el derecho de modificar, actualizar o sustituir los presentes Términos en cualquier
            momento. Las modificaciones entrarán en vigor desde su publicación en la plataforma.
          </p>
          <p>
            Se recomienda a los usuarios revisar periódicamente este documento. El uso continuado de los servicios
            tras la publicación de cambios implica la aceptación de los nuevos Términos.
          </p>
          <p>
            Para cambios sustanciales, la Empresa realizará un esfuerzo razonable por notificar a los usuarios
            registrados por los medios disponibles (correo electrónico, notificación en plataforma).
          </p>
        </Section>

        {/* 11. Jurisdicción y Legislación Aplicable */}
        <Section icon={Scale} title="11. Jurisdicción y Legislación Aplicable">
          <p>
            Los presentes Términos y Condiciones se rigen e interpretan conforme a las leyes vigentes de los{' '}
            <strong className="text-white">Estados Unidos Mexicanos</strong>, en particular:
          </p>
          <ul className="space-y-2 list-none mt-2">
            <Li>Código Civil Federal y del Estado de Puebla (en lo aplicable).</Li>
            <Li>Ley Federal de Protección al Consumidor (LFPC).</Li>
            <Li>Ley Federal de Protección de Datos Personales en Posesión de los Particulares (LFPDPPP).</Li>
            <Li>Ley Federal del Derecho de Autor.</Li>
            <Li>Ley de la Propiedad Industrial.</Li>
            <Li>Ley Federal del Trabajo (para relaciones laborales).</Li>
          </ul>
          <p className="mt-3">
            Para cualquier controversia derivada de estos Términos, las partes se someten expresamente a la
            jurisdicción de los <strong className="text-white">Tribunales competentes de la Ciudad de Puebla, Puebla</strong>,
            renunciando a cualquier otro fuero que pudiera corresponderles por razón de su domicilio presente o futuro.
          </p>
        </Section>

        {/* 12. Disposiciones Finales */}
        <Section icon={FileText} title="12. Disposiciones Finales">
          <ul className="space-y-2 list-none">
            <Li>Si cualquier cláusula de estos Términos fuere declarada nula o inválida, el resto del documento mantendrá plena vigencia.</Li>
            <Li>La tolerancia de la Empresa ante cualquier incumplimiento no implica renuncia a sus derechos.</Li>
            <Li>Estos Términos constituyen el acuerdo completo entre el usuario y la Empresa respecto al uso de la plataforma, sustituyendo cualquier acuerdo previo sobre la misma materia.</Li>
            <Li>Las presentes condiciones pueden existir junto a contratos específicos (laborales, comerciales, de distribución) que prevalecerán en caso de conflicto en sus materias específicas.</Li>
          </ul>
        </Section>

        {/* Contacto */}
        <div className="mt-12 border border-white/10 rounded-2xl p-6 bg-white/[0.03] text-center">
          <p className="text-slate-400 text-sm mb-1">¿Preguntas sobre estos Términos?</p>
          <a href={`mailto:${CORREO}`} className="text-emerald-400 font-semibold hover:text-emerald-300 transition-colors text-sm">
            {CORREO}
          </a>
          <p className="text-slate-600 text-xs mt-3">{DOMICILIO}</p>
          <p className="text-slate-600 text-xs mt-1">© {new Date().getFullYear()} {COMPANY_NAME}. Todos los derechos reservados.</p>
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
