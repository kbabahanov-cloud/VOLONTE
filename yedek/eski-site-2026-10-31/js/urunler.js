// =====================================================
//  VOLONTE — ÜRÜN LİSTESİ
//  Yeni ürün eklemek için bir satırı kopyalayıp değiştirin.
//
//  kod       : Ürün kodu (müşteri WhatsApp'ta bu kodu görür)
//  ad        : Ürün adı
//  kategori  : Aşağıdaki KATEGORILER listesindeki "id" değerlerinden biri
//  bedenler  : Beden aralığı
//  seri      : Bir seride kaç adet var (toptan satış için)
//  renkler   : Renk kodları (renk noktaları olarak görünür)
//  resim     : Fotoğraf dosyası, örn. "resimler/vl-101.jpg"
//              Boş bırakılırsa şık bir renkli kutu gösterilir.
//  yeni      : true ise ürünün üzerinde "New" etiketi çıkar
//              ve ana sayfada "Yeni Gelenler" bölümünde görünür.
// =====================================================

const KATEGORILER = [
  { id: "dresses",  ad: "Dresses",        aciklama: "Midi, maxi and everyday dresses" },
  { id: "sets",     ad: "Two-Piece Sets", aciklama: "Coordinated sets, ready to wear" },
  { id: "tops",     ad: "Tops & Blouses", aciklama: "Blouses, shirts and tunics" },
  { id: "skirts",   ad: "Skirts",         aciklama: "Pleated, pencil and maxi skirts" },
  { id: "trousers", ad: "Trousers",       aciklama: "Wide-leg, palazzo and tailored" },
  { id: "evening",  ad: "Evening Wear",   aciklama: "Occasion and evening dresses" },
  { id: "jumpsuits", ad: "Jumpsuits",      aciklama: "One-piece jumpsuits and playsuits" },
  { id: "outerwear", ad: "Jackets & Coats", aciklama: "Jackets, blazers and coats" }
];

const URUNLER = [
  { kod: "VL-101", ad: "Wrap Midi Dress",          kategori: "dresses",  bedenler: "S – XL",   seri: 4, renkler: ["#8B1E3F", "#1F3A5F", "#C8963E"], resim: "", yeni: true },
  { kod: "VL-102", ad: "Pleated Maxi Dress",       kategori: "dresses",  bedenler: "M – 3XL",  seri: 5, renkler: ["#2E5E4E", "#E7D8C9"],            resim: "", yeni: true },
  { kod: "VL-103", ad: "Belted Shirt Dress",       kategori: "dresses",  bedenler: "S – XXL",  seri: 5, renkler: ["#F2EDE4", "#1C1C1C"],            resim: "", yeni: false },
  { kod: "VL-104", ad: "Satin Slip Dress",         kategori: "dresses",  bedenler: "S – XL",   seri: 4, renkler: ["#B5651D", "#5B2A86"],            resim: "", yeni: false },

  { kod: "VL-201", ad: "Linen Blazer Set",         kategori: "sets",     bedenler: "S – XXL",  seri: 5, renkler: ["#D9C7A7", "#1C1C1C"],            resim: "", yeni: true },
  { kod: "VL-202", ad: "Printed Kaftan Set",       kategori: "sets",     bedenler: "M – 3XL",  seri: 4, renkler: ["#C8963E", "#8B1E3F"],            resim: "", yeni: false },
  { kod: "VL-203", ad: "Knit Top & Skirt Set",     kategori: "sets",     bedenler: "S – XL",   seri: 4, renkler: ["#A3B18A", "#E7D8C9"],            resim: "", yeni: false },

  { kod: "VL-301", ad: "Silk-Touch Blouse",        kategori: "tops",     bedenler: "S – XXL",  seri: 5, renkler: ["#FFFFFF", "#C9A9A6", "#1F3A5F"], resim: "", yeni: true },
  { kod: "VL-302", ad: "Puff Sleeve Top",          kategori: "tops",     bedenler: "S – XL",   seri: 4, renkler: ["#F4A259", "#1C1C1C"],            resim: "", yeni: false },
  { kod: "VL-303", ad: "Oversized Tunic",          kategori: "tops",     bedenler: "M – 3XL",  seri: 4, renkler: ["#2E5E4E", "#D9C7A7"],            resim: "", yeni: false },

  { kod: "VL-401", ad: "Pleated Midi Skirt",       kategori: "skirts",   bedenler: "S – XXL",  seri: 5, renkler: ["#C8963E", "#1C1C1C"],            resim: "", yeni: false },
  { kod: "VL-402", ad: "Satin Maxi Skirt",         kategori: "skirts",   bedenler: "S – XL",   seri: 4, renkler: ["#5B2A86", "#8B1E3F"],            resim: "", yeni: false },

  { kod: "VL-501", ad: "Wide-Leg Trousers",        kategori: "trousers", bedenler: "S – XXL",  seri: 5, renkler: ["#E7D8C9", "#1C1C1C", "#1F3A5F"], resim: "", yeni: true },
  { kod: "VL-502", ad: "Palazzo Pants",            kategori: "trousers", bedenler: "M – 3XL",  seri: 4, renkler: ["#B5651D", "#2E5E4E"],            resim: "", yeni: false },

  { kod: "VL-601", ad: "Sequin Evening Gown",      kategori: "evening",  bedenler: "S – XXL",  seri: 5, renkler: ["#C8963E", "#1C1C1C"],            resim: "", yeni: true },
  { kod: "VL-602", ad: "Draped Satin Gown",        kategori: "evening",  bedenler: "S – XL",   seri: 4, renkler: ["#8B1E3F", "#1F3A5F"],            resim: "", yeni: false }
];
