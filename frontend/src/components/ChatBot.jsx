import { useState, useRef, useEffect } from 'react';
import { MessageCircle, X, Send, Bot, User, Ticket, ArrowLeft, Loader2, Phone } from 'lucide-react';
import { Button } from './ui/button';
import { supportAPI } from '../lib/api';
import { toast } from 'sonner';

const SUPPORT_PHONE = '+447400757168';
const WHATSAPP_LINK = `https://wa.me/447400757168`;

const FAQ_SUGGESTIONS = [
  '¿Cómo retiro mi dinero?',
  '¿Por qué debo pagar impuesto?',
  '¿Cuánto tarda un retiro?',
  '¿Cuál es el pago mínimo?',
  '¿Cómo verifico mi cuenta?',
  '¿Qué es LIONSBIT?',
  'Contactar soporte',
];

const FAQ_RESPONSES = {
  'retiro': {
    keywords: ['retiro', 'retirar', 'withdraw', 'sacar', 'dinero', 'fondos'],
    answer: 'Para solicitar un retiro:\n\n1. Ve a la sección **Withdraw** en el menú lateral\n2. Selecciona la cuenta y el monto a retirar\n3. Se generará un impuesto obligatorio de **$4,850 USD**\n4. Debes pagar el impuesto en criptomonedas (pagos parciales de mínimo $200 USD)\n5. Una vez completado el pago, el administrador revisará y aprobará tu retiro'
  },
  'impuesto': {
    keywords: ['impuesto', 'tax', 'por qué pagar', 'pagar impuesto', '4850', '4,850', 'tributar'],
    answer: 'El impuesto de **$4,850 USD** es un requisito obligatorio para procesar retiros. Este impuesto de cumplimiento fiscal debe ser pagado en criptomonedas antes de que se procese su retiro. Puede realizar pagos parciales con un mínimo de **$200 USD** por pago.'
  },
  'tiempo': {
    keywords: ['cuánto tarda', 'tiempo', 'demora', 'cuanto tiempo', 'rápido', 'plazo', 'esperar'],
    answer: 'Los tiempos de procesamiento son:\n\n- **Pago de impuesto:** Tiene **72 horas** para completar el pago del impuesto\n- **Revisión admin:** Una vez pagado el impuesto, el administrador revisa en 24-48 horas\n- **Procesamiento:** Después de aprobado, el retiro se procesa en 1-3 días hábiles\n\nSi no se completa el pago del impuesto en 72 horas, el retiro se rechaza automáticamente.'
  },
  'minimo': {
    keywords: ['mínimo', 'minimo', 'pago parcial', 'abono', 'parcial', '200'],
    answer: 'El **pago mínimo** por cada abono al impuesto es de **$200 USD**. Puede realizar múltiples pagos parciales hasta completar el total de $4,850 USD. Todos los pagos deben realizarse en criptomonedas (Bitcoin, Ethereum, USDT, etc.).'
  },
  'verificacion': {
    keywords: ['verificar', 'verificación', 'kyc', 'identidad', 'documento', 'selfie'],
    answer: 'Para verificar su cuenta (KYC):\n\n1. Ve a **Verification** en el menú\n2. Suba la foto frontal de su documento (Pasaporte, DNI o Licencia)\n3. Suba la foto trasera del documento\n4. Tome una **selfie sosteniendo su documento**\n5. Escriba su nombre legal completo como firma digital\n6. Acepte los términos y envíe\n\nEl equipo revisará su solicitud en 24-48 horas.'
  },
  'lionsbit': {
    keywords: ['lionsbit', 'plataforma', 'qué es', 'que es', 'información', 'informacion'],
    answer: '**LIONSBIT VERIFICACION** es una plataforma de verificación digital y análisis financiero informativo. Ofrecemos herramientas de análisis de mercado, información de criptomonedas, conversor de divisas, proyecciones y más.\n\n**Aviso legal:** Esta plataforma es exclusivamente informativa y no está habilitada para inversiones reales.'
  },
  'soporte': {
    keywords: ['soporte', 'ayuda', 'contactar', 'problema', 'ticket', 'contacto', 'telefono', 'whatsapp', 'llamar', 'numero'],
    answer: 'Puede contactarnos por estos medios:\n\n**WhatsApp/Teléfono:** +447400757168\n\n**Ticket de soporte:** Cree uno desde este chat o vaya a **Support** en el menú\n\n**Email:** info@paylionsbit.es\n\nNuestro equipo responderá lo antes posible.',
    showContact: true
  },
  'transferencia': {
    keywords: ['transferir', 'transferencia', 'enviar', 'transfer'],
    answer: 'Para realizar una transferencia:\n\n1. Ve a **Transfer** en el menú\n2. Ingrese el ID de cuenta del destinatario\n3. Seleccione el monto y la moneda\n4. Confirme la transferencia\n\n**Límites:** $10,000 EUR diarios (usuarios verificados) / $1,000 EUR (no verificados).'
  },
  'crypto': {
    keywords: ['crypto', 'bitcoin', 'ethereum', 'usdt', 'criptomoneda', 'wallet', 'billetera'],
    answer: 'Los pagos de impuestos se aceptan en las siguientes criptomonedas:\n\n- **Bitcoin (BTC)**\n- **Ethereum (ETH)**\n- **BNB (BEP20)**\n- **USDT (TRC20)**\n\nAl realizar un pago, se le proporcionará la dirección de la wallet y un código QR para enviar el monto.'
  }
};

function findResponse(message) {
  const lower = message.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  let bestMatch = null;
  let bestScore = 0;
  for (const [, faq] of Object.entries(FAQ_RESPONSES)) {
    let score = 0;
    for (const keyword of faq.keywords) {
      const normalizedKeyword = keyword.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
      if (lower.includes(normalizedKeyword)) {
        score += normalizedKeyword.length;
      }
    }
    if (score > bestScore) {
      bestScore = score;
      bestMatch = faq;
    }
  }
  if (bestMatch && bestScore > 0) {
    return { text: bestMatch.answer, matched: true, showContact: !!bestMatch.showContact };
  }
  return {
    text: 'No he encontrado una respuesta exacta a su pregunta. Puede crear un **ticket de soporte** o contactarnos por **WhatsApp** al +447400757168 para recibir atención personalizada.',
    matched: false,
    showContact: true
  };
}

function formatMessage(text) {
  return text.split('\n').map((line, i) => {
    let formatted = line.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');
    return <p key={i} className={line === '' ? 'h-2' : ''} dangerouslySetInnerHTML={{ __html: formatted }} />;
  });
}

export const ChatBot = () => {
  const [isOpen, setIsOpen] = useState(false);
  const [messages, setMessages] = useState([
    {
      id: 'welcome',
      role: 'bot',
      text: '¡Hola! Soy el asistente virtual de LIONSBIT. ¿En qué puedo ayudarle hoy?',
      time: new Date().toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' }),
      showTicketBtn: false,
    }
  ]);
  const [input, setInput] = useState('');
  const [isTyping, setIsTyping] = useState(false);
  const [showSuggestions, setShowSuggestions] = useState(true);
  // Ticket creation state
  const [ticketMode, setTicketMode] = useState(false);
  const [ticketSubject, setTicketSubject] = useState('');
  const [ticketMessage, setTicketMessage] = useState('');
  const [ticketSending, setTicketSending] = useState(false);

  const messagesEndRef = useRef(null);
  const inputRef = useRef(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, isTyping]);

  useEffect(() => {
    if (isOpen && inputRef.current) {
      inputRef.current.focus();
    }
  }, [isOpen]);

  const sendMessage = (text) => {
    if (!text.trim()) return;
    const userMsg = {
      id: Date.now().toString(),
      role: 'user',
      text: text.trim(),
      time: new Date().toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' }),
      showTicketBtn: false,
    };
    setMessages(prev => [...prev, userMsg]);
    setInput('');
    setShowSuggestions(false);
    setIsTyping(true);

    setTimeout(() => {
      const response = findResponse(text);
      const botMsg = {
        id: (Date.now() + 1).toString(),
        role: 'bot',
        text: response.text,
        time: new Date().toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' }),
        showTicketBtn: !response.matched,
        showContact: response.showContact || false,
      };
      setMessages(prev => [...prev, botMsg]);
      setIsTyping(false);
    }, 800 + Math.random() * 600);
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    sendMessage(input);
  };

  const handleCreateTicket = async () => {
    if (!ticketSubject.trim() || ticketSubject.trim().length < 5) {
      toast.error('El asunto debe tener al menos 5 caracteres');
      return;
    }
    if (!ticketMessage.trim() || ticketMessage.trim().length < 10) {
      toast.error('El mensaje debe tener al menos 10 caracteres');
      return;
    }
    setTicketSending(true);
    try {
      await supportAPI.createTicket({
        subject: ticketSubject.trim(),
        message: ticketMessage.trim(),
        category: 'general',
      });
      toast.success('Ticket de soporte creado exitosamente');
      setTicketMode(false);
      setTicketSubject('');
      setTicketMessage('');
      // Add confirmation message
      setMessages(prev => [...prev, {
        id: Date.now().toString(),
        role: 'bot',
        text: 'Su **ticket de soporte** ha sido creado exitosamente. Nuestro equipo le responderá lo antes posible. Puede ver el estado de sus tickets en la sección **Support** del menú.',
        time: new Date().toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' }),
        showTicketBtn: false,
      }]);
    } catch (error) {
      toast.error(error.response?.data?.detail || 'Error al crear ticket');
    } finally {
      setTicketSending(false);
    }
  };

  return (
    <>
      {/* Floating Button */}
      {!isOpen && (
        <button
          onClick={() => setIsOpen(true)}
          data-testid="chatbot-open-btn"
          className="fixed bottom-6 right-6 z-50 w-14 h-14 rounded-full bg-emerald-500 hover:bg-emerald-400 text-white shadow-lg shadow-emerald-500/30 flex items-center justify-center transition-all duration-300 hover:scale-110"
        >
          <MessageCircle className="w-6 h-6" />
        </button>
      )}

      {/* Chat Window */}
      {isOpen && (
        <div
          data-testid="chatbot-window"
          className="fixed bottom-6 right-6 z-50 w-[360px] max-w-[calc(100vw-2rem)] h-[520px] max-h-[calc(100vh-3rem)] bg-slate-900 border border-slate-700 rounded-2xl shadow-2xl shadow-black/50 flex flex-col overflow-hidden"
        >
          {/* Header */}
          <div className="bg-slate-800 border-b border-slate-700 px-4 py-3 flex items-center justify-between flex-shrink-0">
            <div className="flex items-center gap-3">
              {ticketMode && (
                <button onClick={() => setTicketMode(false)} className="w-8 h-8 rounded-full hover:bg-slate-700 flex items-center justify-center transition-colors" data-testid="ticket-back-btn">
                  <ArrowLeft className="w-4 h-4 text-slate-400" />
                </button>
              )}
              <div className="w-9 h-9 rounded-full bg-emerald-500/20 flex items-center justify-center">
                <Bot className="w-5 h-5 text-emerald-400" />
              </div>
              <div>
                <p className="text-sm font-semibold text-white">{ticketMode ? 'Crear Ticket' : 'Asistente LIONSBIT'}</p>
                <p className="text-xs text-emerald-400">{ticketMode ? 'Soporte personalizado' : 'En línea'}</p>
              </div>
            </div>
            <button
              onClick={() => setIsOpen(false)}
              data-testid="chatbot-close-btn"
              className="w-8 h-8 rounded-full hover:bg-slate-700 flex items-center justify-center transition-colors"
            >
              <X className="w-4 h-4 text-slate-400" />
            </button>
          </div>

          {/* Ticket Creation Mode */}
          {ticketMode ? (
            <div className="flex-1 p-4 space-y-4 overflow-y-auto">
              <div className="p-3 rounded-lg bg-emerald-500/10 border border-emerald-500/30">
                <p className="text-emerald-400 text-sm">Nuestro equipo revisará su consulta y le responderá lo antes posible.</p>
              </div>
              <div className="space-y-2">
                <label className="text-slate-300 text-sm font-medium">Asunto *</label>
                <input
                  value={ticketSubject}
                  onChange={(e) => setTicketSubject(e.target.value)}
                  placeholder="Ej: Problema con mi pago de impuesto"
                  className="w-full bg-slate-800 border border-slate-700 rounded-xl px-4 py-2.5 text-sm text-white placeholder-slate-500 focus:outline-none focus:border-emerald-500/50 transition-colors"
                  data-testid="ticket-subject-input"
                />
              </div>
              <div className="space-y-2">
                <label className="text-slate-300 text-sm font-medium">Mensaje *</label>
                <textarea
                  value={ticketMessage}
                  onChange={(e) => setTicketMessage(e.target.value)}
                  placeholder="Describa su problema o consulta en detalle..."
                  rows={5}
                  className="w-full bg-slate-800 border border-slate-700 rounded-xl px-4 py-2.5 text-sm text-white placeholder-slate-500 focus:outline-none focus:border-emerald-500/50 transition-colors resize-none"
                  data-testid="ticket-message-input"
                />
              </div>
              <Button
                onClick={handleCreateTicket}
                disabled={ticketSending || !ticketSubject.trim() || ticketSubject.trim().length < 5 || !ticketMessage.trim() || ticketMessage.trim().length < 10}
                className="w-full bg-emerald-500 hover:bg-emerald-400 text-white py-2.5"
                data-testid="ticket-submit-btn"
              >
                {ticketSending ? (
                  <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Enviando...</>
                ) : (
                  <><Ticket className="w-4 h-4 mr-2" /> Crear Ticket de Soporte</>
                )}
              </Button>
            </div>
          ) : (
            <>
              {/* Messages */}
              <div className="flex-1 overflow-y-auto p-4 space-y-4 scrollbar-thin">
                {messages.map((msg) => (
                  <div key={msg.id}>
                    <div className={`flex gap-2 ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                      {msg.role === 'bot' && (
                        <div className="w-7 h-7 rounded-full bg-emerald-500/20 flex items-center justify-center flex-shrink-0 mt-1">
                          <Bot className="w-4 h-4 text-emerald-400" />
                        </div>
                      )}
                      <div className={`max-w-[80%] rounded-2xl px-4 py-2.5 text-sm leading-relaxed ${
                        msg.role === 'user'
                          ? 'bg-emerald-500 text-white rounded-br-md'
                          : 'bg-slate-800 text-slate-200 rounded-bl-md'
                      }`}>
                        <div className="space-y-0.5">{formatMessage(msg.text)}</div>
                        <p className={`text-[10px] mt-1.5 ${msg.role === 'user' ? 'text-emerald-100/60' : 'text-slate-500'}`}>{msg.time}</p>
                      </div>
                      {msg.role === 'user' && (
                        <div className="w-7 h-7 rounded-full bg-slate-700 flex items-center justify-center flex-shrink-0 mt-1">
                          <User className="w-4 h-4 text-slate-300" />
                        </div>
                      )}
                    </div>
                    {/* Show contact actions (WhatsApp + Ticket) */}
                    {(msg.showTicketBtn || msg.showContact) && (
                      <div className="ml-9 mt-2 flex flex-wrap gap-2">
                        {msg.showContact && (
                          <a
                            href={WHATSAPP_LINK}
                            target="_blank"
                            rel="noopener noreferrer"
                            data-testid="chatbot-whatsapp-btn"
                            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-green-500/10 border border-green-500/30 text-green-400 text-xs font-medium hover:bg-green-500/20 transition-colors"
                          >
                            <Phone className="w-3.5 h-3.5" />
                            WhatsApp
                          </a>
                        )}
                        {msg.showTicketBtn && (
                          <button
                            onClick={() => setTicketMode(true)}
                            data-testid="chatbot-create-ticket-btn"
                            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-amber-500/10 border border-amber-500/30 text-amber-400 text-xs font-medium hover:bg-amber-500/20 transition-colors"
                          >
                            <Ticket className="w-3.5 h-3.5" />
                            Crear ticket
                          </button>
                        )}
                      </div>
                    )}
                  </div>
                ))}
                
                {isTyping && (
                  <div className="flex gap-2 items-start">
                    <div className="w-7 h-7 rounded-full bg-emerald-500/20 flex items-center justify-center flex-shrink-0">
                      <Bot className="w-4 h-4 text-emerald-400" />
                    </div>
                    <div className="bg-slate-800 rounded-2xl rounded-bl-md px-4 py-3">
                      <div className="flex gap-1">
                        <span className="w-2 h-2 bg-slate-500 rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
                        <span className="w-2 h-2 bg-slate-500 rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
                        <span className="w-2 h-2 bg-slate-500 rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
                      </div>
                    </div>
                  </div>
                )}
                
                <div ref={messagesEndRef} />
              </div>

              {/* Suggestions */}
              {showSuggestions && messages.length <= 1 && (
                <div className="px-4 pb-2 flex-shrink-0">
                  <p className="text-xs text-slate-500 mb-2">Preguntas frecuentes:</p>
                  <div className="flex flex-wrap gap-1.5">
                    {FAQ_SUGGESTIONS.map((s, i) => (
                      <button key={i} onClick={() => sendMessage(s)} data-testid={`chatbot-suggestion-${i}`}
                        className="text-xs bg-slate-800 hover:bg-slate-700 text-slate-300 px-3 py-1.5 rounded-full border border-slate-700 hover:border-emerald-500/50 transition-colors"
                      >
                        {s}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* Input + Contact CTAs */}
              <div className="border-t border-slate-700 flex-shrink-0">
                <form onSubmit={handleSubmit} className="px-4 py-3 flex gap-2">
                  <input
                    ref={inputRef}
                    type="text"
                    value={input}
                    onChange={(e) => setInput(e.target.value)}
                    placeholder="Escriba su pregunta..."
                    data-testid="chatbot-input"
                    className="flex-1 bg-slate-800 border border-slate-700 rounded-xl px-4 py-2.5 text-sm text-white placeholder-slate-500 focus:outline-none focus:border-emerald-500/50 transition-colors"
                  />
                  <Button type="submit" disabled={!input.trim() || isTyping} data-testid="chatbot-send-btn"
                    className="w-10 h-10 rounded-xl bg-emerald-500 hover:bg-emerald-400 disabled:opacity-40 p-0 flex items-center justify-center"
                  >
                    <Send className="w-4 h-4" />
                  </Button>
                </form>
                <div className="px-4 pb-3 pt-0 flex gap-2">
                  <a
                    href={WHATSAPP_LINK}
                    target="_blank"
                    rel="noopener noreferrer"
                    data-testid="chatbot-footer-whatsapp"
                    className="flex-1 flex items-center justify-center gap-2 py-2 rounded-lg bg-green-500/10 hover:bg-green-500/20 border border-green-500/30 text-green-400 hover:text-green-300 text-xs transition-colors"
                  >
                    <Phone className="w-3.5 h-3.5" />
                    {SUPPORT_PHONE}
                  </a>
                  <button
                    onClick={() => setTicketMode(true)}
                    data-testid="chatbot-ticket-btn"
                    className="flex-1 flex items-center justify-center gap-2 py-2 rounded-lg bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-400 hover:text-white text-xs transition-colors"
                  >
                    <Ticket className="w-3.5 h-3.5" />
                    Crear ticket
                  </button>
                </div>
              </div>
            </>
          )}
        </div>
      )}
    </>
  );
};
