import http from "node:http";

const tenantId = "11111111-1111-4111-8111-111111111111";
const tenant = {
  id: tenantId,
  slug: "demo-comercio",
  name: "Almacén Demo",
  description: "Comercio de prueba para QA de SmartBarrio.",
  business_type: "almacen",
  phone: "+54 261 555 0000",
  whatsapp_number: "5492615550000",
  address: "San Martín 100",
  city: "Mendoza",
  province: "Mendoza",
  opening_hours: {
    monday: { open: "09:00", close: "18:00", closed: false },
    tuesday: { open: "09:00", close: "18:00", closed: false },
    wednesday: { open: "09:00", close: "18:00", closed: false },
    thursday: { open: "09:00", close: "18:00", closed: false },
    friday: { open: "09:00", close: "18:00", closed: false },
    saturday: { open: "09:00", close: "13:00", closed: false },
    sunday: { open: "09:00", close: "13:00", closed: true }
  },
  instagram_url: "https://instagram.com/almacen.demo",
  google_review_url: "https://g.page/r/demo/review",
  logo_url: null,
  is_published: true
};

const products = [{
  id: "22222222-2222-4222-8222-222222222222",
  name: "Yerba orgánica",
  description: "Paquete de un kilo.",
  price: 4200,
  image_url: null,
  kind: "product",
  is_available: true,
  sort_order: 1
}];

const offers = [{
  id: "33333333-3333-4333-8333-333333333333",
  title: "Oferta de prueba",
  description: "Promoción para validar la landing.",
  offer_price: 3900,
  starts_at: "2026-01-01T00:00:00.000Z",
  expires_at: null,
  status: "published"
}];

const server = http.createServer((request, response) => {
  const url = new URL(request.url ?? "/", "http://127.0.0.1:54321");
  response.setHeader("Content-Type", "application/json");
  response.setHeader("Access-Control-Allow-Origin", "*");

  if (url.pathname === "/rest/v1/tenants") {
    response.end(JSON.stringify(url.searchParams.get("slug") === "eq.demo-comercio" ? [tenant] : []));
    return;
  }
  if (url.pathname === "/rest/v1/products_services") {
    response.end(JSON.stringify(url.searchParams.get("tenant_id") === "eq." + tenantId ? products : []));
    return;
  }
  if (url.pathname === "/rest/v1/offers") {
    response.end(JSON.stringify(url.searchParams.get("tenant_id") === "eq." + tenantId ? offers : []));
    return;
  }
  response.end(JSON.stringify([]));
});

server.listen(54321, "127.0.0.1", () => {
  process.stdout.write("Mock Supabase REST listening on 127.0.0.1:54321\n");
});
