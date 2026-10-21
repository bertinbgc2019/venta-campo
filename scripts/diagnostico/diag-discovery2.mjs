const disc = await (await fetch("https://firebaserules.googleapis.com/$discovery/rest?version=v1")).json();
console.log("=== UpdateReleaseRequest ===");
console.log(JSON.stringify(disc.schemas.UpdateReleaseRequest, null, 2));
