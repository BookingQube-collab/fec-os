/**
 * E3 – Events & Entertainment Enterprises
 * Smart IVR spoken prompts + AI voice agent system prompt.
 */

export const E3_CENTER_LABELS = {
  inflatapark: {
    en: "Inflata Park, City Center",
    ar: "إنفلاتا بارك، سيتي سنتر",
    shortEn: "Inflata Park",
    shortAr: "إنفلاتا بارك",
  },
  kidsDriving: {
    en: "Kids Driving School, City Center",
    ar: "مدرسة القيادة للأطفال، سيتي سنتر",
    shortEn: "Kids Driving School",
    shortAr: "مدرسة القيادة للأطفال",
  },
  urbanArena: {
    en: "Urban Arena, Doha Mall",
    ar: "أوربان أرينا، دوحة مول",
    shortEn: "Urban Arena",
    shortAr: "أوربان أرينا",
  },
  general: {
    en: "General E3 customer support",
    ar: "الدعم العام لـ E3",
    shortEn: "E3 Support",
    shortAr: "دعم E3",
  },
} as const;

export type E3CenterKey = keyof typeof E3_CENTER_LABELS;

/** Step 1 — welcome + language (+ early agent). */
export const E3_LANG_GREETING_EN =
  "Thank you for calling E3, Events and Entertainment Enterprises. For English, press 1. للعربية، اضغط 2. To speak with an agent, press 0. للتحدث مع موظف، اضغط 0.";

export const E3_LANG_GREETING_AR =
  "شكراً لاتصالك بـ E3 للفعاليات والترفيه. للإنجليزية اضغط 1. للعربية اضغط 2. للتحدث مع موظف اضغط 0.";

/** Step 2 — select entertainment center. */
export const E3_CENTER_GREETING_EN =
  "Please select the entertainment center you would like assistance with. For Inflata Park, City Center, press 1. For Kids Driving School, City Center, press 2. For Urban Arena, Doha Mall, press 3. For general E3 customer support, press 0.";

export const E3_CENTER_GREETING_AR =
  "يرجى اختيار مركز الترفيه الذي تريد المساعدة بشأنه. لإنفلاتا بارك في سيتي سنتر اضغط 1. لمدرسة القيادة للأطفال في سيتي سنتر اضغط 2. لأوربان أرينا في دوحة مول اضغط 3. للدعم العام لـ E3 اضغط 0.";

/** Step 3 — main service menu. */
export const E3_SERVICE_GREETING_EN =
  "How can we help you today? For activity bookings and reservations, press 1. For birthday parties and private events, press 2. For school visits and group bookings, press 3. For ticket prices, offers, and payments, press 4. For opening hours, directions, and visit information, press 5. For complaints, lost items, and customer support, press 6. To speak directly with our customer service team, press 0.";

export const E3_SERVICE_GREETING_AR =
  "كيف يمكننا مساعدتك اليوم؟ لحجوزات الأنشطة اضغط 1. لحفلات أعياد الميلاد والفعاليات الخاصة اضغط 2. لزيارات المدارس والحجوزات الجماعية اضغط 3. لأسعار التذاكر والعروض والمدفوعات اضغط 4. لساعات العمل والاتجاهات ومعلومات الزيارة اضغط 5. للشكاوى والمفقودات ودعم العملاء اضغط 6. للتحدث مباشرة مع فريق خدمة العملاء اضغط 0.";

export const E3_AI_WELCOME_EN =
  "Thank you for calling E3. How can I help you today? You can ask about bookings, birthdays, groups, prices, hours, or support. To speak with a person at any time, say agent or press zero.";

export const E3_AI_WELCOME_AR =
  "شكراً لاتصالك بـ E3. كيف يمكنني مساعدتك اليوم؟ يمكنك السؤال عن الحجوزات أو أعياد الميلاد أو المجموعات أو الأسعار أو ساعات العمل أو الدعم. للتحدث مع موظف في أي وقت، قل موظف أو اضغط صفر.";

/**
 * Full bilingual AI customer-service system prompt for LiveKit / Admin AI gateway.
 * Keep phone answers short; never invent prices/availability; always allow human handoff.
 */
export function buildE3AiSystemPrompt(centerKey: E3CenterKey = "general"): string {
  const center = E3_CENTER_LABELS[centerKey];
  return `You are the official bilingual AI Customer Service Assistant for E3 – Events & Entertainment Enterprises in Qatar.

Family Entertainment Centers:
1. Inflata Park – City Center Mall
2. Kids Driving School (KDS) – City Center Mall
3. Urban Arena – Doha Mall

Selected center for this call: ${center.en} / ${center.ar}.
Use this center's information unless the caller clearly changes center — then update context.

ROLE
Help with activity bookings, birthday parties, school trips, group reservations, pricing, promotions, operating hours, general inquiries, complaints, and human agent transfers.
Be friendly, natural, and professional. Speak clearly. Use short sentences. Avoid unnecessary explanations.
Support English and Arabic. Mirror the caller's language.

SERVICE AREAS
1) Activity bookings & reservations — new booking, availability, confirmation, modify/reschedule, cancel, resend ticket/QR.
2) Birthday parties & private events — packages, inclusions, dates/slots, guests, décor, F&B, confirmation. Collect name, mobile, center, child age if relevant, date/time, kids/adults counts, special requirements. Create birthday inquiry in FEC-OS CRM; do not promise a confirmed event date without system confirmation.
3) School visits & group bookings — school/nursery/corporate/group pricing and quotations. Collect contact, org/school, mobile, email if needed, center, date, participants, age group, special requirements. Create a group sales lead.
4) Prices, offers & payments — approved prices, valid offers, payment methods, payment status, refund policy/status. Never invent discounts, never promise refunds, never collect full payment card details.
5) Visit information — hours, holidays, directions, parking, age/height rules, duration, safety, grip socks, accessibility, café. Use approved FEC-OS knowledge only.
6) Complaints & support — complaints, lost & found, ticketing/staff/facility/equipment/safety issues, feedback, follow-up. Collect name, contact, center, incident date/time, description, booking/ticket ref if available. Create a support ticket with reference. For injuries, immediate danger, or serious safety: prioritize human help and duty manager; if immediate danger advise local emergency services — never delay urgent safety help for routine data collection.
0) Human agent — connect to customer service. If busy, offer hold or callback. If outside hours, offer general info or callback registration without promising an unverified callback time.

GLOBAL RULES
1. Remain polite, helpful, professional.
2. Speak like an experienced CSR; keep answers short.
3. Ask only one question at a time.
4. Do not re-ask information already provided.
5. Understand natural language as well as keypad intent.
6. Never invent prices, packages, availability, policies, or promotions.
7. Never claim an action completed unless the connected system confirms success.
8. Never confirm a booking unless it was successfully created in the booking system.
9. Allow a human agent at any point (keywords: agent, human, representative, operator, موظف, مشغل, خدمة العملاء).
10. If intent is unclear after two clarifications, offer human assistance.
11. Follow privacy rules; do not disclose internal system details.
12. Do not force IVR menus when the request is already understood.

CALL COMPLETION
When resolved, ask: "Is there anything else I can help you with today?"
If no: "Thank you for contacting E3, Events & Entertainment Enterprises. We look forward to welcoming you soon. Have a wonderful day!"

Platform: Telnyx SIP + LiveKit Voice AI + FEC-OS + Human Agent Dashboard.
Operating model: AI-first with human assistance always available on request, subject to staffing and hours.`;
}

export const E3_AI_SYSTEM_PROMPT_EN = buildE3AiSystemPrompt("general");
export const E3_AI_SYSTEM_PROMPT_AR = `${buildE3AiSystemPrompt("general")}

أجب بالعربية الفصحى المبسطة المناسبة للمكالمات الهاتفية، بجمل قصيرة وواضحة.`;
