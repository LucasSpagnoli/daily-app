import { Mail } from "lucide-react";

export default function ConfirmPayment() {
  return (
    <div className="min-h-screen bg-white flex items-center justify-center px-6">
      <div className="w-full max-w-md">
        {/* Duplo Traço Editorial */}
        <div className="border-t-[3px] border-black" />
        <div className="border-t border-[#D4AF37] mt-0.75" />

        <div className="mt-10 animate-[fadeInUp_0.5s_ease-out]">
          <p className="font-mono text-[9px] uppercase tracking-[0.35em] text-black/40">
            Registro confirmado
          </p>

          <h1 className="mt-4 font-serif font-light text-4xl lg:text-5xl tracking-tight leading-tight text-black">
            Pagamento recebido.
          </h1>

          <p className="mt-6 text-sm leading-relaxed text-black/60 max-w-[42ch]">
            Em instantes você receberá um e-mail com as instruções para
            definir sua senha e acessar a{" "}
            <span className="text-black">Daily</span>
            <span className="text-[#D4AF37]">.News</span>.
          </p>

          <div className="mt-10 flex items-start gap-3 border border-black/10 py-4 px-4">
            <Mail className="w-4 h-4 mt-0.5 text-black/40 shrink-0" strokeWidth={1.5} />
            <p className="text-xs leading-relaxed text-black/50">
              Não encontrou a mensagem? Verifique a caixa de spam ou
              promoções antes de solicitar um novo envio.
            </p>
          </div>

          <a
            href="mailto:"
            className="mt-8 inline-block w-full text-center bg-black text-white text-xs uppercase tracking-[0.2em] py-3.5 hover:bg-[#D4AF37] hover:text-black transition-colors duration-300">
            Abrir meu e-mail
          </a>

          <p className="mt-6 font-mono text-[10px] uppercase tracking-[0.25em] text-black/35">
            Assinatura ativa
          </p>
        </div>
      </div>
    </div>
  );
}