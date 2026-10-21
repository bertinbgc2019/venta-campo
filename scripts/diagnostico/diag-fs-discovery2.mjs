const disc = await (await fetch("https://firestore.googleapis.com/$discovery/rest?version=v1")).json();
console.log("=== CollectionSelector ===");
console.log(JSON.stringify(disc.schemas.CollectionSelector, null, 2));
