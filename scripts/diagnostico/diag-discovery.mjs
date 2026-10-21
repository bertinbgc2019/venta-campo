const disc = await (await fetch("https://firebaserules.googleapis.com/$discovery/rest?version=v1")).json();
const rel = disc.schemas.Release;
console.log("=== Release schema ===");
console.log(JSON.stringify(rel, null, 2));
console.log("\n=== metodo patch de releases ===");
console.log(JSON.stringify(disc.resources.projects.resources.releases.methods.patch, null, 2));
