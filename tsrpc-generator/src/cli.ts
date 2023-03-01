import ts from "typescript"
import minimist from "minimist"
import { generateService } from "."
import * as fs from "fs/promises"

async function main() {
    const args = minimist(process.argv.slice(2))

    if (args._.length !== 2) {
        console.error("Usage: tsrpc-generator <ts-file> <root-type-name>")
        process.exit(-1)
    }

    const generated = await generateService(args._[0], args._[1])

    if (args["out"]) {
        await fs.writeFile(args["out"], JSON.stringify(generated, undefined, 2), "utf-8")
    } else {
        console.log(JSON.stringify(generated, undefined, 2))
    }
}

main()