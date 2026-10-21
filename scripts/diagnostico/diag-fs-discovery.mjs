const disc = await (await fetch("https://firestore.googleapis.com/$discovery/rest?version=v1")).json();
console.log("=== StructuredQuery.From ===");
console.log(JSON.stringify(disc.schemas.StructuredQuery?.properties?.from, null, 2));
const fr = disc.schemas.GoogleFirestoreAdminV1StructuredQueryFrom || Object.entries(disc.schemas).filter(([k])=>/From$/.test(k)).map(([k,v])=>[k,v]);
console.log("=== esquemas *From* ===");
console.log(JSON.stringify(fr, null, 2).substring(0, 2000));
