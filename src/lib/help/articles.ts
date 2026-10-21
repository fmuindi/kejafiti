// Help articles: the only source the help assistant may answer from (AI-11). Versioned with the
// code so an answer always matches what the product does today. Keep each one true and short.

export const HELP_VERSION = "help-v1";

export type HelpArticle = { id: string; question: string; answer: string };

export const HELP_ARTICLES: HelpArticle[] = [
  { id: "payments", question: "Does nyumbani take rent payments?", answer: "No. Tenants pay through each property's own arrangements. Staff check payments outside nyumbani, then record and confirm them here." },
  { id: "viewing-pending", question: "Why does my viewing say \"not confirmed\"?", answer: "A request stays pending until the advertiser accepts it. If the time passes first, ask for a new time from Viewings." },
  { id: "totals-incomplete", question: "Why do some totals say \"incomplete\"?", answer: "The advertiser hasn't confirmed every compulsory charge yet. Ask them before you pay anything." },
  { id: "confirm-permission", question: "I'm staff. Why can't I confirm a payment?", answer: "Confirming needs the \"Can confirm rent records\" permission. Ask the workspace owner, who can see and change your access under Team." },
  { id: "report-listing", question: "How do I report a suspicious listing?", answer: "Open the listing and use \"Report this listing\". Our team reviews every report." },
  { id: "describe-search", question: "How does \"Describe your home\" search work?", answer: "Type or say what you want, in English or Kiswahili. It is turned into the ordinary search filters, which are shown so you can check or change them, and Undo puts back your previous search. It never books, pays or messages anyone for you." },
  { id: "rent-questions", question: "Who do I ask about my rent balance?", answer: "Questions about your rent go to your landlord or property manager. nyumbani support can't change rent records." },
];

export const articleById = (id: string) => HELP_ARTICLES.find((a) => a.id === id);
