export type GlossaryLanguage = "english" | "tagalog";

export type GlossaryDefinition = Record<GlossaryLanguage, string>;

export type GlossaryEntry = {
  id: string;
  term: string;
  definition: GlossaryDefinition;
  example?: string;
  // Search-only words, including the Filipino words people use for the same idea.
  keywords?: readonly string[];
};

// Plain-language definitions for the finance words the app shows. Each (i) button links here by id.
export const GLOSSARY_TERMS = [
  {
    id: "accrued-interest",
    term: "Accrued interest",
    definition: {
      english: "Interest that has already built up but has not been paid or added to your balance yet.",
      tagalog: "Interes na naipon na pero hindi pa nababayaran o naidadagdag sa balance mo.",
    },
    keywords: ["interes", "tubo"],
  },
  {
    id: "add-on-rate",
    term: "Add-on rate (flat rate)",
    definition: {
      english: "Interest is computed on the full amount you borrowed for the whole loan term, even as you pay it down. Many lenders and lending apps quote this rate. It looks lower than it really is: an add-on rate can cost close to double the same diminishing-balance rate.",
      tagalog: "Kinukuwenta ang interes sa buong halagang hiniram mo sa buong termino ng loan, kahit lumiliit na ang utang mo habang nagbabayad ka. Ito ang rate na madalas sinasabi ng mga lender at lending app. Mukha itong mababa pero hindi: ang add-on rate ay puwedeng halos doble ang gastos kumpara sa parehong diminishing-balance rate.",
    },
    example: "Borrow ₱100,000 at 1.5% add-on a month for 12 months: interest is ₱100,000 × 1.5% × 12 = ₱18,000, even though you owe less every month.",
    keywords: ["flat", "interes", "tubo", "loan", "utang"],
  },
  {
    id: "allocation",
    term: "Allocation",
    definition: {
      english: "The amount your Financial Plan sets aside for a category this period. \"Over allocation\" means you have spent more than that amount.",
      tagalog: "Ang halagang itinatabi ng Financial Plan mo para sa isang category ngayong period. Ang \"over allocation\" ay nangangahulugang lumampas na ang gastos mo sa halagang iyon.",
    },
    example: "Food: ₱8,000 allocation. If you spend ₱8,500, you are ₱500 over allocation.",
    keywords: ["budget", "over allocation", "category allocations"],
  },
  {
    id: "annual-interest-rate",
    term: "Annual interest rate (APR)",
    definition: {
      english: "The interest rate for one whole year. The \"nominal\" rate is the rate as stated, before counting how often interest is added. A monthly rate of 2% is a 24% annual rate.",
      tagalog: "Ang interest rate para sa isang buong taon. Ang \"nominal\" rate ay ang rate na nakasaad, bago bilangin kung gaano kadalas idinadagdag ang interes. Ang 2% kada buwan ay 24% kada taon.",
    },
    keywords: ["apr", "nominal", "interes", "tubo", "rate"],
  },
  {
    id: "auto-post",
    term: "Auto-post",
    definition: {
      english: "Budgie records a scheduled bill or remittance as paid on its due date, so you don't have to enter it yourself.",
      tagalog: "Kusang itatala ng Budgie ang naka-schedule na bill o padala bilang bayad na sa due date nito, kaya hindi mo na kailangang i-enter ito.",
    },
    keywords: ["automatic", "biller", "remittance"],
  },
  {
    id: "available-balance",
    term: "Available balance",
    definition: {
      english: "The money in all your accounts right now. Income you expect but have not received yet is not included until it is posted.",
      tagalog: "Ang pera sa lahat ng account mo ngayon. Hindi pa kasama ang inaasahang kita na hindi mo pa natatanggap hangga't hindi pa ito naka-post.",
    },
    keywords: ["pera", "balance"],
  },
  {
    id: "available-credit",
    term: "Available credit",
    definition: {
      english: "How much you can still charge to your credit card. It is your credit limit minus what you currently owe.",
      tagalog: "Kung magkano pa ang puwede mong i-charge sa credit card mo. Ito ang credit limit mo bawas ang kasalukuyang utang mo.",
    },
    example: "₱50,000 limit − ₱12,000 owed = ₱38,000 available credit.",
    keywords: ["credit card"],
  },
  {
    id: "avalanche",
    term: "Avalanche",
    definition: {
      english: "A debt repayment strategy: pay the minimum on every debt, then put any extra money on the debt with the highest interest rate first. It saves the most on interest.",
      tagalog: "Paraan ng pagbabayad ng utang: bayaran ang minimum sa bawat utang, tapos ilagay ang sobrang pera sa utang na may pinakamataas na interest rate muna. Ito ang pinakamakakatipid sa interes.",
    },
    keywords: ["strategy", "utang", "repayment"],
  },
  {
    id: "billing-cycle",
    term: "Billing cycle",
    definition: {
      english: "The period, usually about a month, in which your credit card purchases are grouped into one bill. It ends on the cut-off date.",
      tagalog: "Ang period, karaniwang mga isang buwan, kung saan pinagsasama-sama sa isang bill ang mga binili mo gamit ang credit card. Nagtatapos ito sa cut-off date.",
    },
    keywords: ["credit card", "cycle"],
  },
  {
    id: "cash-flow",
    term: "Net monthly cash flow",
    definition: {
      english: "Money that came in this month minus money that went out (your outflows). A positive number means you earned more than you spent.",
      tagalog: "Ang perang pumasok ngayong buwan bawas ang perang lumabas (outflows mo). Kapag positibo, mas malaki ang kinita mo kaysa sa ginastos mo.",
    },
    keywords: ["inflow", "outflow", "cashflow", "pasok", "labas"],
  },
  {
    id: "compound-interest",
    term: "Compound interest",
    definition: {
      english: "Interest that is also earned on past interest. Your balance grows faster over time than with simple interest.",
      tagalog: "Interes na kumikita rin ng interes mula sa dating interes. Mas mabilis lumaki ang balance mo sa paglipas ng panahon kaysa sa simple interest.",
    },
    example: "₱10,000 at 5% a year: year 1 earns ₱500, year 2 earns ₱525 because the ₱500 also earns interest.",
    keywords: ["interes", "tubo", "savings"],
  },
  {
    id: "credit-limit",
    term: "Credit limit",
    definition: {
      english: "The most your bank lets you owe on a credit card at one time.",
      tagalog: "Ang pinakamalaking halagang pinapayagan ng bangko na utangin mo sa credit card sa isang pagkakataon.",
    },
    keywords: ["credit card", "limit"],
  },
  {
    id: "cut-off",
    term: "Cut-off date",
    definition: {
      english: "The last day of a credit card billing cycle. Purchases after the cut-off go to next month's bill. This is not your salary cut-off (kinsenas or katapusan).",
      tagalog: "Ang huling araw ng billing cycle ng credit card. Ang mga binili pagkatapos ng cut-off ay mapupunta sa bill sa susunod na buwan. Hindi ito ang cut-off ng sahod mo (kinsenas o katapusan).",
    },
    keywords: ["cutoff", "credit card", "billing"],
  },
  {
    id: "debt-burden",
    term: "Debt burden",
    definition: {
      english: "How much of your monthly income goes to required debt payments. The higher it is, the harder it is to cover your other needs.",
      tagalog: "Kung gaano kalaking bahagi ng buwanang kita mo ang napupunta sa mga kailangang bayaran sa utang. Habang tumataas ito, mas nahihirapan kang tustusan ang iba mo pang pangangailangan.",
    },
    example: "₱25,000 income and ₱10,000 in monthly loan payments = 40% debt burden.",
    keywords: ["utang", "dti", "debt to income"],
  },
  {
    id: "debt-consolidation",
    term: "Debt consolidation",
    definition: {
      english: "Combining several debts into one new loan, ideally with a lower interest rate and one monthly payment.",
      tagalog: "Pagsasama-sama ng ilang utang sa isang bagong loan, mas mabuti kung may mas mababang interest rate at iisang buwanang bayad.",
    },
    keywords: ["utang", "loan"],
  },
  {
    id: "diminishing-balance",
    term: "Diminishing balance",
    definition: {
      english: "Interest is computed only on what you still owe. As you pay down the loan, the interest gets smaller. This is cheaper than an add-on rate at the same number.",
      tagalog: "Kinukuwenta lang ang interes sa natitira mo pang utang. Habang binabayaran mo ang loan, lumiliit din ang interes. Mas mura ito kaysa sa add-on rate na pareho ang numero.",
    },
    keywords: ["declining", "interes", "tubo", "loan", "utang"],
  },
  {
    id: "early-settlement",
    term: "Early settlement",
    definition: {
      english: "Paying off a loan or installment in full before its term ends. The bank may charge a pre-termination fee.",
      tagalog: "Pagbabayad nang buo sa loan o hulugan bago matapos ang termino nito. Puwedeng maningil ang bangko ng pre-termination fee.",
    },
    keywords: ["pay off", "installment", "hulugan"],
  },
  {
    id: "effective-dated-rate",
    term: "Effective-dated rate",
    definition: {
      english: "An interest rate that starts on a specific date. Budgie keeps the older rates so past interest is still computed correctly.",
      tagalog: "Interest rate na nagsisimula sa isang partikular na petsa. Itinatago ng Budgie ang mga lumang rate para tama pa rin ang kuwenta ng mga nakaraang interes.",
    },
    keywords: ["rate change", "interes"],
  },
  {
    id: "emergency-fund",
    term: "Emergency fund",
    definition: {
      english: "Savings kept only for emergencies like job loss, illness, or urgent repairs. Budgie shows how many months of your expenses it could cover. A common goal is 3 to 6 months.",
      tagalog: "Ipon na para lang sa emergency gaya ng pagkawala ng trabaho, pagkakasakit, o biglaang pagpapaayos. Ipinapakita ng Budgie kung ilang buwan ng gastos mo ang kaya nitong sagutin. Karaniwang target ang 3 hanggang 6 na buwan.",
    },
    keywords: ["ipon", "savings", "emergency"],
  },
  {
    id: "financial-margin",
    term: "Financial margin",
    definition: {
      english: "What is left of your monthly income after your expenses and debt payments. If it is negative, you are spending more than you earn.",
      tagalog: "Ang natitira sa buwanang kita mo pagkatapos ng gastos at bayad sa utang. Kapag negatibo, mas malaki ang ginagastos mo kaysa sa kinikita mo.",
    },
    keywords: ["sobra", "kulang", "left over"],
  },
  {
    id: "forecast",
    term: "Forecast",
    definition: {
      english: "Budgie's estimate of what you will likely spend or owe in the coming months, based on your past spending and scheduled payments. It is a guide, not a guarantee.",
      tagalog: "Tantiya ng Budgie kung magkano ang malamang na gagastusin o uutangin mo sa mga susunod na buwan, batay sa dati mong gastos at mga naka-schedule na bayarin. Gabay lang ito, hindi garantiya.",
    },
    keywords: ["projection", "projected", "estimate", "spending forecast"],
  },
  {
    id: "forecast-quality",
    term: "Forecast quality",
    definition: {
      english: "How reliable a forecast is. The more months of spending you record, the better the quality.",
      tagalog: "Kung gaano maaasahan ang isang forecast. Habang dumarami ang buwan ng gastos na naitatala mo, gumaganda ang quality.",
    },
    keywords: ["reliability", "forecast"],
  },
  {
    id: "forecast-vs-actual",
    term: "Forecast vs Actual",
    definition: {
      english: "Compares what Budgie expected you to spend with what you really spent, so you can see where your spending changed.",
      tagalog: "Pinaghahambing ang inaasahan ng Budgie na gagastusin mo at ang talagang ginastos mo, para makita mo kung saan nagbago ang paggastos mo.",
    },
    keywords: ["forecast", "actual", "comparison"],
  },
  {
    id: "minimum-amount-due",
    term: "Minimum amount due",
    definition: {
      english: "The smallest payment your bank accepts by the due date to avoid a late fee. The unpaid rest of your balance still earns interest, so paying only the minimum makes the debt last longer.",
      tagalog: "Ang pinakamaliit na bayad na tatanggapin ng bangko bago ang due date para hindi ka ma-late fee. Patuloy na magkakainteres ang hindi nabayarang natitira, kaya kapag minimum lang ang binabayaran mo, mas tatagal ang utang.",
    },
    keywords: ["minimum", "credit card", "recommended minimum"],
  },
  {
    id: "minimum-qualifying-balance",
    term: "Minimum qualifying balance",
    definition: {
      english: "The lowest balance a savings account needs before the bank pays interest on it.",
      tagalog: "Ang pinakamababang balance na kailangan ng savings account bago magbayad ng interes ang bangko.",
    },
    keywords: ["maintaining balance", "savings", "interes"],
  },
  {
    id: "monthly-amortization",
    term: "Monthly amortization",
    definition: {
      english: "The fixed amount you pay every month on a loan or installment. It covers part of the principal plus interest.",
      tagalog: "Ang pare-parehong halagang binabayaran mo buwan-buwan sa loan o hulugan. Sakop nito ang bahagi ng principal at ang interes.",
    },
    keywords: ["hulog", "hulugan", "installment", "amortisation"],
  },
  {
    id: "payoff",
    term: "Payoff date",
    definition: {
      english: "The date your debt is expected to be fully paid if you keep your current payments. Budgie shows it as your debt-free milestone.",
      tagalog: "Ang petsa kung kailan inaasahang bayad na nang buo ang utang mo kung itutuloy mo ang kasalukuyang bayad. Ipinapakita ito ng Budgie bilang debt-free milestone mo.",
    },
    keywords: ["debt-free", "milestone", "utang"],
  },
  {
    id: "posted",
    term: "Posted transaction",
    definition: {
      english: "A transaction that is already recorded in your accounts, not just scheduled or expected.",
      tagalog: "Transaksyong naitala na sa mga account mo, hindi lang naka-schedule o inaasahan.",
    },
    keywords: ["recorded", "transaction"],
  },
  {
    id: "pre-termination-fee",
    term: "Pre-termination fee",
    definition: {
      english: "A fee some banks and lenders charge when you pay off a loan, installment, or time deposit before its end date.",
      tagalog: "Bayad na sinisingil ng ilang bangko at lender kapag binayaran mo nang buo ang loan, hulugan, o time deposit bago ang takdang petsa nito.",
    },
    keywords: ["penalty", "early settlement", "fee"],
  },
  {
    id: "principal",
    term: "Principal",
    definition: {
      english: "The original amount you borrowed or deposited, not counting interest.",
      tagalog: "Ang orihinal na halagang hiniram o idineposito mo, hindi kasama ang interes.",
    },
    example: "You borrow ₱50,000. ₱50,000 is the principal; the interest is charged on top.",
    keywords: ["utang", "puhunan", "loan"],
  },
  {
    id: "provisional-forecast",
    term: "Provisional forecast",
    definition: {
      english: "A rough forecast Budgie shows while you have fewer than 6 months of recorded spending. It becomes personal once you have more history.",
      tagalog: "Pansamantalang forecast na ipinapakita ng Budgie habang wala ka pang 6 na buwan ng naitalang gastos. Magiging personal ito kapag mas marami ka nang history.",
    },
    keywords: ["forecast", "estimate"],
  },
  {
    id: "reconcile-available-credit",
    term: "Reconcile available credit",
    definition: {
      english: "Make the available credit in Budgie match the number in your bank's app or statement, so your balances stay accurate.",
      tagalog: "Itugma ang available credit sa Budgie sa numerong nasa app o statement ng bangko mo, para manatiling tama ang mga balance mo.",
    },
    keywords: ["reconciliation", "credit card", "match"],
  },
  {
    id: "repayment-strategy",
    term: "Repayment strategy",
    definition: {
      english: "The order in which extra money goes to your debts. Avalanche pays the highest interest rate first and saves the most money. Snowball pays the smallest balance first so you clear debts sooner.",
      tagalog: "Ang pagkakasunod-sunod kung saang utang mapupunta ang sobrang pera. Inuuna ng Avalanche ang may pinakamataas na interest rate at ito ang pinakamakakatipid. Inuuna ng Snowball ang pinakamaliit na balance para mas mabilis kang makatapos ng utang.",
    },
    keywords: ["avalanche", "snowball", "utang", "strategy"],
  },
  {
    id: "reservation",
    term: "Reservation",
    definition: {
      english: "Money your Financial Plan sets aside this period for a bill, debt payment, or savings contribution, so it is not counted as free to spend.",
      tagalog: "Perang itinatabi ng Financial Plan mo ngayong period para sa bill, bayad sa utang, o ipon, kaya hindi ito binibilang na malayang gastusin.",
    },
    example: "Reserved ₱1,500 · Paid ₱1,000 means ₱500 is still set aside for that bill.",
    keywords: ["reserved", "required reservation", "set aside"],
  },
  {
    id: "safe-to-spend",
    term: "Safe to spend",
    definition: {
      english: "How much is left in this period's Financial Plan budget, and about how much you can spend per day until it ends.",
      tagalog: "Kung magkano pa ang natitira sa budget ng Financial Plan mo ngayong period, at humigit-kumulang kung magkano ang puwede mong gastusin kada araw hanggang matapos ito.",
    },
    keywords: ["budget", "left", "daily"],
  },
  {
    id: "shortfall",
    term: "Shortfall",
    definition: {
      english: "How much money is missing to cover what your plan needs. An essentials shortfall means your income does not cover your essential costs.",
      tagalog: "Kung magkano ang kulang para matugunan ang kailangan ng plan mo. Ang essentials shortfall ay nangangahulugang hindi sapat ang kita mo para sa mahahalagang gastusin.",
    },
    keywords: ["kulang", "deficit", "plan shortfall", "essentials shortfall"],
  },
  {
    id: "simple-interest",
    term: "Simple interest",
    definition: {
      english: "Interest computed only on the original amount, never on past interest. Compare with compound interest.",
      tagalog: "Interes na kinukuwenta lang sa orihinal na halaga, hindi kailanman sa dating interes. Ikumpara sa compound interest.",
    },
    example: "₱10,000 at 5% a year earns ₱500 every year.",
    keywords: ["interes", "tubo", "savings"],
  },
  {
    id: "snowball",
    term: "Snowball",
    definition: {
      english: "A debt repayment strategy: pay the minimum on every debt, then put any extra money on the smallest balance first. Clearing debts quickly keeps you motivated. For savings goals, snowball puts extra money on the goals closest to their target.",
      tagalog: "Paraan ng pagbabayad ng utang: bayaran ang minimum sa bawat utang, tapos ilagay ang sobrang pera sa pinakamaliit na balance muna. Nakakaganang magpatuloy kapag mabilis kang nakakatapos ng utang. Para sa savings goals, inuuna ng snowball ang mga goal na pinakamalapit na sa target.",
    },
    keywords: ["strategy", "utang", "repayment"],
  },
  {
    id: "statement",
    term: "Statement (SOA)",
    definition: {
      english: "The monthly bill your bank sends for your credit card. It lists your purchases, the statement balance, the minimum amount due, and the due date.",
      tagalog: "Ang buwanang bill na ipinapadala ng bangko para sa credit card mo. Nakalista rito ang mga binili mo, ang statement balance, ang minimum amount due, at ang due date.",
    },
    keywords: ["soa", "statement of account", "bill", "credit card"],
  },
  {
    id: "statement-balance",
    term: "Statement balance",
    definition: {
      english: "The total you owe on your credit card as of the cut-off date. Paying it in full by the due date avoids interest.",
      tagalog: "Ang kabuuang utang mo sa credit card hanggang sa cut-off date. Kapag binayaran mo ito nang buo bago ang due date, wala kang babayarang interes.",
    },
    keywords: ["soa", "credit card", "balance"],
  },
  {
    id: "subcategory-weight",
    term: "Subcategory weight",
    definition: {
      english: "The share of a category's allocation that goes to each of its subcategories.",
      tagalog: "Ang bahagi ng allocation ng isang category na napupunta sa bawat subcategory nito.",
    },
    example: "Leisure ₱2,000 with Movies at 25% gives Movies ₱500.",
    keywords: ["percent", "subcategory"],
  },
  {
    id: "surplus",
    term: "Surplus",
    definition: {
      english: "Money left over after your plan covers its needs. Budgie can suggest where to put it, like extra debt payments or savings.",
      tagalog: "Perang natira matapos matugunan ng plan mo ang mga pangangailangan nito. Puwedeng magmungkahi ang Budgie kung saan ito ilalagay, gaya ng dagdag na bayad sa utang o ipon.",
    },
    keywords: ["sobra", "extra", "strategy surplus"],
  },
] as const satisfies readonly GlossaryEntry[];

export type GlossaryTermId = (typeof GLOSSARY_TERMS)[number]["id"];
