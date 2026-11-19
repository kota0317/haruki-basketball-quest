// Non-production scaffold: all requests fail closed. No database or user data.
export default {
  async fetch() {
    return new Response(JSON.stringify({error:'sync_not_configured'}), {
      status:503,
      headers:{'content-type':'application/json; charset=utf-8','cache-control':'no-store','x-content-type-options':'nosniff'}
    });
  }
};
