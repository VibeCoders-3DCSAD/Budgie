export type GlossaryEntry = {
  id: string;
  term: string;
  definition: string;
  example?: string;
  // Search-only words, including the Filipino words people use for the same idea.
  keywords?: readonly string[];
};

// Plain-language definitions for the finance words the app shows. Each (i) button links here by id.
export const GLOSSARY_TERMS = [
  {
    id: "accrued-interest",
    term: "Accrued interest",
    definition: "Interest that has already built up but has not been paid or added to your balance yet.",
    keywords: ["interes", "tubo"],
  },
  {
    id: "add-on-rate",
    term: "Add-on rate (flat rate)",
    definition: "Interest is computed on the full amount you borrowed for the whole loan term, even as you pay it down. Many lenders and lending apps quote this rate. It looks lower than it really is: an add-on rate can cost close to double the same diminishing-balance rate.",
    example: "Borrow ₱100,000 at 1.5% add-on a month for 12 months: interest is ₱100,000 × 1.5% × 12 = ₱18,000, even though you owe less every month.",
    keywords: ["flat", "interes", "tubo", "loan", "utang"],
  },
  {
    id: "allocation",
    term: "Allocation",
    definition: "The amount your Financial Plan sets aside for a category this period. \"Over allocation\" means you have spent more than that amount.",
    example: "Food: ₱8,000 allocation. If you spend ₱8,500, you are ₱500 over allocation.",
    keywords: ["budget", "over allocation", "category allocations"],
  },
  {
    id: "annual-interest-rate",
    term: "Annual interest rate (APR)",
    definition: "The interest rate for one whole year. The \"nominal\" rate is the rate as stated, before counting how often interest is added. A monthly rate of 2% is a 24% annual rate.",
    keywords: ["apr", "nominal", "interes", "tubo", "rate"],
  },
  {
    id: "auto-post",
    term: "Auto-post",
    definition: "Budgie records a scheduled bill or remittance as paid on its due date, so you don't have to enter it yourself.",
    keywords: ["automatic", "biller", "remittance"],
  },
  {
    id: "available-balance",
    term: "Available balance",
    definition: "The money in all your accounts right now. Income you expect but have not received yet is not included until it is posted.",
    keywords: ["pera", "balance"],
  },
  {
    id: "available-credit",
    term: "Available credit",
    definition: "How much you can still charge to your credit card. It is your credit limit minus what you currently owe.",
    example: "₱50,000 limit − ₱12,000 owed = ₱38,000 available credit.",
    keywords: ["credit card"],
  },
  {
    id: "avalanche",
    term: "Avalanche",
    definition: "A debt repayment strategy: pay the minimum on every debt, then put any extra money on the debt with the highest interest rate first. It saves the most on interest.",
    keywords: ["strategy", "utang", "repayment"],
  },
  {
    id: "billing-cycle",
    term: "Billing cycle",
    definition: "The period, usually about a month, in which your credit card purchases are grouped into one bill. It ends on the cut-off date.",
    keywords: ["credit card", "cycle"],
  },
  {
    id: "cash-flow",
    term: "Net monthly cash flow",
    definition: "Money that came in this month minus money that went out (your outflows). A positive number means you earned more than you spent.",
    keywords: ["inflow", "outflow", "cashflow", "pasok", "labas"],
  },
  {
    id: "compound-interest",
    term: "Compound interest",
    definition: "Interest that is also earned on past interest. Your balance grows faster over time than with simple interest.",
    example: "₱10,000 at 5% a year: year 1 earns ₱500, year 2 earns ₱525 because the ₱500 also earns interest.",
    keywords: ["interes", "tubo", "savings"],
  },
  {
    id: "credit-limit",
    term: "Credit limit",
    definition: "The most your bank lets you owe on a credit card at one time.",
    keywords: ["credit card", "limit"],
  },
  {
    id: "cut-off",
    term: "Cut-off date",
    definition: "The last day of a credit card billing cycle. Purchases after the cut-off go to next month's bill. This is not your salary cut-off (kinsenas or katapusan).",
    keywords: ["cutoff", "credit card", "billing"],
  },
  {
    id: "debt-burden",
    term: "Debt burden",
    definition: "How much of your monthly income goes to required debt payments. The higher it is, the harder it is to cover your other needs.",
    example: "₱25,000 income and ₱10,000 in monthly loan payments = 40% debt burden.",
    keywords: ["utang", "dti", "debt to income"],
  },
  {
    id: "debt-consolidation",
    term: "Debt consolidation",
    definition: "Combining several debts into one new loan, ideally with a lower interest rate and one monthly payment.",
    keywords: ["utang", "loan"],
  },
  {
    id: "diminishing-balance",
    term: "Diminishing balance",
    definition: "Interest is computed only on what you still owe. As you pay down the loan, the interest gets smaller. This is cheaper than an add-on rate at the same number.",
    keywords: ["declining", "interes", "tubo", "loan", "utang"],
  },
  {
    id: "early-settlement",
    term: "Early settlement",
    definition: "Paying off a loan or installment in full before its term ends. The bank may charge a pre-termination fee.",
    keywords: ["pay off", "installment", "hulugan"],
  },
  {
    id: "effective-dated-rate",
    term: "Effective-dated rate",
    definition: "An interest rate that starts on a specific date. Budgie keeps the older rates so past interest is still computed correctly.",
    keywords: ["rate change", "interes"],
  },
  {
    id: "emergency-fund",
    term: "Emergency fund",
    definition: "Savings kept only for emergencies like job loss, illness, or urgent repairs. Budgie shows how many months of your expenses it could cover. A common goal is 3 to 6 months.",
    keywords: ["ipon", "savings", "emergency"],
  },
  {
    id: "financial-margin",
    term: "Financial margin",
    definition: "What is left of your monthly income after your expenses and debt payments. If it is negative, you are spending more than you earn.",
    keywords: ["sobra", "kulang", "left over"],
  },
  {
    id: "forecast",
    term: "Forecast",
    definition: "Budgie's estimate of what you will likely spend or owe in the coming months, based on your past spending and scheduled payments. It is a guide, not a guarantee.",
    keywords: ["projection", "projected", "estimate", "spending forecast"],
  },
  {
    id: "forecast-quality",
    term: "Forecast quality",
    definition: "How reliable a forecast is. The more months of spending you record, the better the quality.",
    keywords: ["reliability", "forecast"],
  },
  {
    id: "forecast-vs-actual",
    term: "Forecast vs Actual",
    definition: "Compares what Budgie expected you to spend with what you really spent, so you can see where your spending changed.",
    keywords: ["forecast", "actual", "comparison"],
  },
  {
    id: "minimum-amount-due",
    term: "Minimum amount due",
    definition: "The smallest payment your bank accepts by the due date to avoid a late fee. The unpaid rest of your balance still earns interest, so paying only the minimum makes the debt last longer.",
    keywords: ["minimum", "credit card", "recommended minimum"],
  },
  {
    id: "minimum-qualifying-balance",
    term: "Minimum qualifying balance",
    definition: "The lowest balance a savings account needs before the bank pays interest on it.",
    keywords: ["maintaining balance", "savings", "interes"],
  },
  {
    id: "monthly-amortization",
    term: "Monthly amortization",
    definition: "The fixed amount you pay every month on a loan or installment. It covers part of the principal plus interest.",
    keywords: ["hulog", "hulugan", "installment", "amortisation"],
  },
  {
    id: "payoff",
    term: "Payoff date",
    definition: "The date your debt is expected to be fully paid if you keep your current payments. Budgie shows it as your debt-free milestone.",
    keywords: ["debt-free", "milestone", "utang"],
  },
  {
    id: "posted",
    term: "Posted transaction",
    definition: "A transaction that is already recorded in your accounts, not just scheduled or expected.",
    keywords: ["recorded", "transaction"],
  },
  {
    id: "pre-termination-fee",
    term: "Pre-termination fee",
    definition: "A fee some banks and lenders charge when you pay off a loan, installment, or time deposit before its end date.",
    keywords: ["penalty", "early settlement", "fee"],
  },
  {
    id: "principal",
    term: "Principal",
    definition: "The original amount you borrowed or deposited, not counting interest.",
    example: "You borrow ₱50,000. ₱50,000 is the principal; the interest is charged on top.",
    keywords: ["utang", "puhunan", "loan"],
  },
  {
    id: "provisional-forecast",
    term: "Provisional forecast",
    definition: "A rough forecast Budgie shows while you have fewer than 6 months of recorded spending. It becomes personal once you have more history.",
    keywords: ["forecast", "estimate"],
  },
  {
    id: "reconcile-available-credit",
    term: "Reconcile available credit",
    definition: "Make the available credit in Budgie match the number in your bank's app or statement, so your balances stay accurate.",
    keywords: ["reconciliation", "credit card", "match"],
  },
  {
    id: "repayment-strategy",
    term: "Repayment strategy",
    definition: "The order in which extra money goes to your debts. Avalanche pays the highest interest rate first and saves the most money. Snowball pays the smallest balance first so you clear debts sooner.",
    keywords: ["avalanche", "snowball", "utang", "strategy"],
  },
  {
    id: "reservation",
    term: "Reservation",
    definition: "Money your Financial Plan sets aside this period for a bill, debt payment, or savings contribution, so it is not counted as free to spend.",
    example: "Reserved ₱1,500 · Paid ₱1,000 means ₱500 is still set aside for that bill.",
    keywords: ["reserved", "required reservation", "set aside"],
  },
  {
    id: "safe-to-spend",
    term: "Safe to spend",
    definition: "How much is left in this period's Financial Plan budget, and about how much you can spend per day until it ends.",
    keywords: ["budget", "left", "daily"],
  },
  {
    id: "shortfall",
    term: "Shortfall",
    definition: "How much money is missing to cover what your plan needs. An essentials shortfall means your income does not cover your essential costs.",
    keywords: ["kulang", "deficit", "plan shortfall", "essentials shortfall"],
  },
  {
    id: "simple-interest",
    term: "Simple interest",
    definition: "Interest computed only on the original amount, never on past interest. Compare with compound interest.",
    example: "₱10,000 at 5% a year earns ₱500 every year.",
    keywords: ["interes", "tubo", "savings"],
  },
  {
    id: "snowball",
    term: "Snowball",
    definition: "A debt repayment strategy: pay the minimum on every debt, then put any extra money on the smallest balance first. Clearing debts quickly keeps you motivated. For savings goals, snowball puts extra money on the goals closest to their target.",
    keywords: ["strategy", "utang", "repayment"],
  },
  {
    id: "statement",
    term: "Statement (SOA)",
    definition: "The monthly bill your bank sends for your credit card. It lists your purchases, the statement balance, the minimum amount due, and the due date.",
    keywords: ["soa", "statement of account", "bill", "credit card"],
  },
  {
    id: "statement-balance",
    term: "Statement balance",
    definition: "The total you owe on your credit card as of the cut-off date. Paying it in full by the due date avoids interest.",
    keywords: ["soa", "credit card", "balance"],
  },
  {
    id: "subcategory-weight",
    term: "Subcategory weight",
    definition: "The share of a category's allocation that goes to each of its subcategories.",
    example: "Leisure ₱2,000 with Movies at 25% gives Movies ₱500.",
    keywords: ["percent", "subcategory"],
  },
  {
    id: "surplus",
    term: "Surplus",
    definition: "Money left over after your plan covers its needs. Budgie can suggest where to put it, like extra debt payments or savings.",
    keywords: ["sobra", "extra", "strategy surplus"],
  },
] as const satisfies readonly GlossaryEntry[];

export type GlossaryTermId = (typeof GLOSSARY_TERMS)[number]["id"];
