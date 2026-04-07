import archiver from "archiver";
import { createWriteStream, rmSync } from "fs";

async function main() {
    const archive = archiver("zip", {
        zlib: { level: 9 },
        comment: "A comment",
    });
    
    archive.directory("./dist", false);
    archive.pipe(createWriteStream("./dist.zip"));
    
    await archive.finalize();

    rmSync("./dist", { recursive: true });
}

main();