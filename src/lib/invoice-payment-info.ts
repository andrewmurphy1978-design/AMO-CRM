// "How to pay and what happens next" for an invoice: the payment options from Settings, the amount and date, and
// what follows (a confirmation once paid, a new invoice for each later instalment). Written in the client's language.

export interface PaymentInfoInput {
  lang: "en" | "fr";
  amount: string; // already formatted, e.g. "1,725.00 CAD"
  due: string | null; // already formatted date
  paid: boolean;
  interacEmail: string | null;
  // The page where the client pays by card (the CRM's own payment page when Stripe is on, else the saved link).
  cardUrl: string | null;
  // Where this invoice sits among the proposal's instalments, if it is one.
  instalment: { n: number; of: number } | null;
}

export interface PaymentInfo {
  title: string;
  intro: string;
  methods: { label: string; value: string; href?: string }[];
  noMethods: string | null;
  nextTitle: string;
  next: string[];
}

const T = {
  en: {
    title: "How to pay",
    intro: (amount: string, due: string | null) => `Please pay ${amount}${due ? ` by ${due}` : ""} using one of these options:`,
    paidIntro: (amount: string) => `Payment received for ${amount} — thank you.`,
    interac: "Interac e-Transfer",
    interacValue: (email: string) => `Send it to ${email}`,
    card: "Credit card",
    cardValue: "Pay securely online",
    noMethods: "The payment options will be confirmed by email; reply to it if you need them again.",
    nextTitle: "What happens next",
    confirmation: "Once your payment is received, you get a confirmation.",
    nextInstalment: (n: number, of: number) => `When instalment ${n} of ${of} falls due, a new invoice is issued with the same payment options.`,
    lastInstalment: "This is the last instalment of the proposal.",
  },
  fr: {
    title: "Comment payer",
    intro: (amount: string, due: string | null) => `Veuillez payer ${amount}${due ? ` d'ici le ${due}` : ""} par l'un de ces moyens :`,
    paidIntro: (amount: string) => `Paiement de ${amount} reçu — merci.`,
    interac: "Virement Interac",
    interacValue: (email: string) => `Envoyez-le à ${email}`,
    card: "Carte de crédit",
    cardValue: "Payer en ligne en toute sécurité",
    noMethods: "Les modes de paiement vous seront confirmés par courriel ; répondez-y si vous en avez de nouveau besoin.",
    nextTitle: "Et ensuite",
    confirmation: "Dès la réception de votre paiement, vous recevez une confirmation.",
    nextInstalment: (n: number, of: number) => `Lorsque le versement ${n} de ${of} arrive à échéance, une nouvelle facture est émise, avec les mêmes modes de paiement.`,
    lastInstalment: "Ceci est le dernier versement de la soumission.",
  },
};

export function paymentInfo(i: PaymentInfoInput): PaymentInfo {
  const t = T[i.lang];
  const methods: PaymentInfo["methods"] = [];
  if (!i.paid) {
    if (i.interacEmail) methods.push({ label: t.interac, value: t.interacValue(i.interacEmail) });
    if (i.cardUrl) methods.push({ label: t.card, value: t.cardValue, href: i.cardUrl });
  }
  const next = [t.confirmation];
  if (i.instalment) next.push(i.instalment.n < i.instalment.of ? t.nextInstalment(i.instalment.n + 1, i.instalment.of) : t.lastInstalment);
  return {
    title: t.title,
    intro: i.paid ? t.paidIntro(i.amount) : t.intro(i.amount, i.due),
    methods,
    noMethods: !i.paid && methods.length === 0 ? t.noMethods : null,
    nextTitle: t.nextTitle,
    next,
  };
}
