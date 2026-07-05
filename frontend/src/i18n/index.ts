/**
 * Multi-language strings for Bharat Bazaar.
 * Supported: en, hi, sq (Albanian), it, el (Greek), fr, mk (Macedonian)
 */

export type Lang = "en" | "sq" | "hi" | "it" | "el" | "fr";

export const LANGUAGES: { code: Lang; label: string; native: string }[] = [
  { code: "en", label: "English", native: "English" },
  { code: "sq", label: "Albanian", native: "Shqip" },
  { code: "hi", label: "Hindi", native: "हिन्दी" },
  { code: "it", label: "Italian", native: "Italiano" },
  { code: "el", label: "Greek", native: "Ελληνικά" },
  { code: "fr", label: "French", native: "Français" },
];

export type Currency = "LEK" | "EUR";

export const CURRENCIES: { code: Currency; label: string; symbol: string }[] = [
  { code: "LEK", label: "Albanian Lek", symbol: "L" },
  { code: "EUR", label: "Euro", symbol: "€" },
];

type Dict = Record<string, string>;

const en: Dict = {
  app_name: "Bharat Bazaar",
  tagline: "Your bazaar, in your pocket",
  pick_language: "Choose your language",
  pick_currency: "Choose your currency",
  continue: "Continue",
  // tabs
  tab_home: "Home",
  tab_categories: "Categories",
  tab_cart: "Cart",
  tab_orders: "Orders",
  tab_profile: "Profile",
  // home
  promo_banner: "Free delivery on orders over 1500 L · Cash on delivery available",
  shop_by_category: "Shop by category",
  select_category: "Select a category to browse products",
  coming_soon: "Coming soon",
  count_items: "{n} all",
  search_placeholder: "Search for groceries...",
  // product
  add: "Add",
  added: "Added",
  out_of_stock: "Out of stock",
  // cart
  your_cart: "Your cart",
  empty_cart: "Your cart is empty",
  empty_cart_sub: "Add some fresh items to get started",
  subtotal: "Subtotal",
  delivery_fee: "Delivery fee",
  free: "FREE",
  total: "Total",
  proceed_checkout: "Proceed to checkout",
  // checkout
  checkout: "Checkout",
  delivery_address: "Delivery address",
  add_address: "Add address",
  label_home: "Home",
  label_work: "Work",
  address_line1: "Address line 1",
  address_line2: "Apartment, suite (optional)",
  city: "City",
  postal_code: "Postal code",
  country: "Country",
  phone: "Phone",
  payment_method: "Payment method",
  cod: "Cash on Delivery",
  cod_sub: "Pay in cash when your order arrives",
  place_order: "Place order",
  order_note: "Order note (optional)",
  // success
  order_placed: "Order placed!",
  order_id: "Order ID",
  eta: "Arriving in approx",
  minutes: "minutes",
  continue_shopping: "Continue shopping",
  view_orders: "View my orders",
  // orders
  no_orders: "No orders yet",
  no_orders_sub: "Your past orders will appear here",
  items: "items",
  status_placed: "Placed",
  status_packed: "Packed",
  status_delivered: "Delivered",
  // auth
  login: "Login",
  signup: "Sign up",
  username: "Username",
  password: "Password",
  full_name: "Full name",
  email_optional: "Email (optional)",
  phone_number: "Phone number",
  phone_hint: "Include country code, e.g. +355...",
  send_otp: "Send OTP",
  enter_otp: "Enter the 6-digit code we sent you",
  verify: "Verify & create account",
  resend_otp: "Resend code",
  have_account: "Already have an account?",
  no_account: "New to Bharat Bazaar?",
  // profile
  language: "Language",
  currency: "Currency",
  saved_addresses: "Saved addresses",
  logout: "Logout",
  // misc
  loading: "Loading...",
  retry: "Retry",
  cancel: "Cancel",
  save: "Save",
  remove: "Remove",
  error_generic: "Something went wrong. Please try again.",
};

const sq: Dict = {
  ...en,
  tagline: "Pazari yt, tani në xhepin tënd",
  pick_language: "Zgjidh gjuhën",
  pick_currency: "Zgjidh monedhën",
  continue: "Vazhdo",
  tab_home: "Kreu",
  tab_categories: "Kategoritë",
  tab_cart: "Shporta",
  tab_orders: "Porositë",
  tab_profile: "Profili",
  promo_banner: "Dorëzim falas për porositë mbi 1500 L · Pagesë me para në dorë",
  shop_by_category: "Blej sipas kategorisë",
  select_category: "Zgjidh një kategori për të parë produktet",
  coming_soon: "Së shpejti",
  count_items: "{n} të gjitha",
  search_placeholder: "Kërko ushqime...",
  add: "Shto",
  added: "U shtua",
  out_of_stock: "Pa stok",
  your_cart: "Shporta jote",
  empty_cart: "Shporta jote është bosh",
  empty_cart_sub: "Shto disa produkte për të filluar",
  subtotal: "Nën-totali",
  delivery_fee: "Tarifa e dërgimit",
  free: "FALAS",
  total: "Totali",
  proceed_checkout: "Vazhdo me pagesën",
  checkout: "Arka",
  delivery_address: "Adresa e dërgimit",
  add_address: "Shto adresë",
  label_home: "Shtëpia",
  label_work: "Puna",
  address_line1: "Adresa rresht 1",
  address_line2: "Apartament, kati (opsionale)",
  city: "Qyteti",
  postal_code: "Kodi postar",
  country: "Shteti",
  phone: "Telefoni",
  payment_method: "Mënyra e pagesës",
  cod: "Pagesë me para në dorë",
  cod_sub: "Paguaj kur porosia të mbërrijë",
  place_order: "Vendos porosinë",
  order_note: "Shënim porosie (opsional)",
  order_placed: "Porosia u vendos!",
  order_id: "Numri i porosisë",
  eta: "Mbërrin për rreth",
  minutes: "minuta",
  continue_shopping: "Vazhdo blerjen",
  view_orders: "Shiko porositë e mia",
  no_orders: "Ende pa porosi",
  no_orders_sub: "Porositë tuaja të mëparshme do të shfaqen këtu",
  items: "artikuj",
  login: "Hyr",
  signup: "Regjistrohu",
  username: "Emri i përdoruesit",
  password: "Fjalëkalimi",
  full_name: "Emri i plotë",
  email_optional: "Email (opsional)",
  phone_number: "Numri i telefonit",
  phone_hint: "Përfshi kodin e shtetit, p.sh. +355...",
  send_otp: "Dërgo OTP",
  enter_otp: "Vendos kodin 6-shifror që të dërguam",
  verify: "Verifiko & krijo llogarinë",
  resend_otp: "Ridërgo kodin",
  have_account: "Ke tashmë një llogari?",
  no_account: "I ri në Bharat Bazaar?",
  language: "Gjuha",
  currency: "Monedha",
  saved_addresses: "Adresat e ruajtura",
  logout: "Dil",
  loading: "Po ngarkohet...",
  retry: "Provo përsëri",
  cancel: "Anulo",
  save: "Ruaj",
  remove: "Hiq",
  error_generic: "Diçka shkoi keq. Ju lutemi provoni përsëri.",
};

const hi: Dict = {
  ...en,
  tagline: "आपका बाज़ार, अब आपकी जेब में",
  pick_language: "अपनी भाषा चुनें",
  pick_currency: "अपनी मुद्रा चुनें",
  continue: "जारी रखें",
  tab_home: "होम", tab_categories: "श्रेणियाँ", tab_cart: "कार्ट", tab_orders: "ऑर्डर", tab_profile: "प्रोफ़ाइल",
  promo_banner: "1500 L से ऊपर के ऑर्डर पर मुफ्त डिलीवरी · कैश ऑन डिलीवरी उपलब्ध",
  shop_by_category: "श्रेणी के अनुसार खरीदारी करें",
  select_category: "उत्पाद देखने के लिए श्रेणी चुनें",
  coming_soon: "जल्द आ रहा है",
  search_placeholder: "किराने का सामान खोजें...",
  add: "जोड़ें", added: "जोड़ा गया",
  your_cart: "आपकी कार्ट", empty_cart: "आपकी कार्ट खाली है",
  subtotal: "उप-योग", delivery_fee: "डिलीवरी शुल्क", free: "मुफ़्त", total: "कुल",
  proceed_checkout: "चेकआउट पर जाएँ",
  checkout: "चेकआउट", delivery_address: "डिलीवरी पता", add_address: "पता जोड़ें",
  payment_method: "भुगतान विधि", cod: "कैश ऑन डिलीवरी", place_order: "ऑर्डर दें",
  order_placed: "ऑर्डर दिया गया!", continue_shopping: "खरीदारी जारी रखें", view_orders: "मेरे ऑर्डर देखें",
  login: "लॉगिन", signup: "साइन अप", username: "उपयोगकर्ता नाम", password: "पासवर्ड",
  send_otp: "OTP भेजें", verify: "सत्यापित करें", resend_otp: "कोड पुनः भेजें",
  language: "भाषा", currency: "मुद्रा", logout: "लॉगआउट",
};

const it: Dict = {
  ...en,
  tagline: "Il tuo bazar, ora in tasca",
  pick_language: "Scegli la lingua", pick_currency: "Scegli la valuta", continue: "Continua",
  tab_home: "Home", tab_categories: "Categorie", tab_cart: "Carrello", tab_orders: "Ordini", tab_profile: "Profilo",
  promo_banner: "Consegna gratis sopra 1500 L · Pagamento alla consegna",
  shop_by_category: "Acquista per categoria", select_category: "Scegli una categoria",
  coming_soon: "Presto", search_placeholder: "Cerca prodotti...",
  add: "Aggiungi", your_cart: "Il tuo carrello", empty_cart: "Il carrello è vuoto",
  subtotal: "Subtotale", delivery_fee: "Spese di consegna", free: "GRATIS", total: "Totale",
  proceed_checkout: "Vai al checkout", checkout: "Checkout",
  delivery_address: "Indirizzo di consegna", payment_method: "Metodo di pagamento",
  cod: "Pagamento alla consegna", place_order: "Conferma ordine",
  order_placed: "Ordine effettuato!", continue_shopping: "Continua lo shopping", view_orders: "Vedi ordini",
  login: "Accedi", signup: "Registrati", username: "Nome utente", password: "Password",
  send_otp: "Invia OTP", verify: "Verifica", resend_otp: "Reinvia",
  language: "Lingua", currency: "Valuta", logout: "Esci",
};

const el: Dict = {
  ...en,
  tagline: "Το παζάρι σου, τώρα στην τσέπη σου",
  pick_language: "Επίλεξε γλώσσα", pick_currency: "Επίλεξε νόμισμα", continue: "Συνέχεια",
  tab_home: "Αρχική", tab_categories: "Κατηγορίες", tab_cart: "Καλάθι", tab_orders: "Παραγγελίες", tab_profile: "Προφίλ",
  promo_banner: "Δωρεάν παράδοση άνω των 1500 L · Πληρωμή με μετρητά διαθέσιμη",
  shop_by_category: "Αγορά ανά κατηγορία", select_category: "Επίλεξε κατηγορία",
  coming_soon: "Σύντομα", search_placeholder: "Αναζήτηση προϊόντων...",
  add: "Προσθήκη", your_cart: "Το καλάθι σου", empty_cart: "Το καλάθι είναι άδειο",
  subtotal: "Υποσύνολο", delivery_fee: "Έξοδα παράδοσης", free: "ΔΩΡΕΑΝ", total: "Σύνολο",
  proceed_checkout: "Προς ταμείο", checkout: "Ταμείο",
  delivery_address: "Διεύθυνση παράδοσης", payment_method: "Τρόπος πληρωμής",
  cod: "Αντικαταβολή", place_order: "Παραγγελία",
  order_placed: "Η παραγγελία καταχωρήθηκε!", continue_shopping: "Συνέχεια αγορών", view_orders: "Οι παραγγελίες μου",
  login: "Σύνδεση", signup: "Εγγραφή", username: "Όνομα χρήστη", password: "Κωδικός",
  send_otp: "Αποστολή OTP", verify: "Επαλήθευση", resend_otp: "Επαναποστολή",
  language: "Γλώσσα", currency: "Νόμισμα", logout: "Αποσύνδεση",
};

const fr: Dict = {
  ...en,
  tagline: "Votre bazar, maintenant dans votre poche",
  pick_language: "Choisissez votre langue", pick_currency: "Choisissez votre devise", continue: "Continuer",
  tab_home: "Accueil", tab_categories: "Catégories", tab_cart: "Panier", tab_orders: "Commandes", tab_profile: "Profil",
  promo_banner: "Livraison gratuite dès 1500 L · Paiement à la livraison",
  shop_by_category: "Acheter par catégorie", select_category: "Choisissez une catégorie",
  coming_soon: "Bientôt", search_placeholder: "Rechercher des produits...",
  add: "Ajouter", your_cart: "Votre panier", empty_cart: "Votre panier est vide",
  subtotal: "Sous-total", delivery_fee: "Frais de livraison", free: "GRATUIT", total: "Total",
  proceed_checkout: "Passer commande", checkout: "Paiement",
  delivery_address: "Adresse de livraison", payment_method: "Mode de paiement",
  cod: "Paiement à la livraison", place_order: "Commander",
  order_placed: "Commande passée !", continue_shopping: "Continuer mes achats", view_orders: "Mes commandes",
  login: "Connexion", signup: "Inscription", username: "Nom d'utilisateur", password: "Mot de passe",
  send_otp: "Envoyer OTP", verify: "Vérifier", resend_otp: "Renvoyer",
  language: "Langue", currency: "Devise", logout: "Déconnexion",
};

const mk_STRIP_ME = null;
// (mk dictionary removed — Macedonian not supported)


export const DICTS: Record<Lang, Dict> = { en, sq, hi, it, el, fr };

export function t(lang: Lang, key: string, vars?: Record<string, string | number>): string {
  const d = DICTS[lang] || en;
  let str = d[key] ?? en[key] ?? key;
  if (vars) {
    Object.entries(vars).forEach(([k, v]) => {
      str = str.replace(`{${k}}`, String(v));
    });
  }
  return str;
}
