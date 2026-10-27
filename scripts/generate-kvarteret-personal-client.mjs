import { spawnSync } from "node:child_process"
import {
    existsSync,
    mkdtempSync,
    readdirSync,
    readFileSync,
    rmSync,
    statSync,
    writeFileSync,
} from "node:fs"
import { tmpdir } from "node:os"
import { join, relative, resolve } from "node:path"
import { fileURLToPath } from "node:url"

// Typed client for the parts of Personal's API the app uses through
// generated code. Only operations with these OpenAPI tags are kept, so the
// app does not ship code for Personal's other consumers.
const TAGS = ["mobile-shifts"]
const OUTPUT_DIR = "src/core/api/kvarteret-personal"
const SIBLING_OPENAPI = "../kvarteret-personal/openapi.json"

const rootDir = fileURLToPath(new URL("..", import.meta.url))
const isCheck = process.argv.includes("--check")

const loadSpec = () => {
    const input = process.env.KVARTERET_PERSONAL_OPENAPI?.trim() || SIBLING_OPENAPI
    const path = resolve(rootDir, input)
    if (!existsSync(path)) {
        console.error(
            `Personal's openapi.json was not found at ${path}. Check out kvarteret-personal next to ` +
                "this repo, or set KVARTERET_PERSONAL_OPENAPI to the file.",
        )
        process.exit(1)
    }
    return JSON.parse(readFileSync(path, "utf8"))
}

const filterSpec = spec => {
    const paths = {}
    for (const [path, operations] of Object.entries(spec.paths ?? {})) {
        const kept = Object.fromEntries(
            Object.entries(operations).filter(([, operation]) =>
                (operation.tags ?? []).some(tag => TAGS.includes(tag)),
            ),
        )
        if (Object.keys(kept).length > 0) paths[path] = kept
    }
    if (Object.keys(paths).length === 0) {
        console.error(`No operations tagged ${TAGS.join(", ")} in Personal's openapi.json.`)
        process.exit(1)
    }
    return { ...spec, paths }
}

const runGenerator = outputDir => {
    rmSync(outputDir, { force: true, recursive: true })
    const workDir = mkdtempSync(join(tmpdir(), "kvarteret-personal-openapi-"))
    try {
        const input = join(workDir, "openapi.json")
        writeFileSync(input, JSON.stringify(filterSpec(loadSpec())))
        const result = spawnSync(
            "npx",
            ["openapi-ts", "-i", input, "-o", outputDir, "-c", "@hey-api/client-fetch"],
            { cwd: rootDir, stdio: "inherit" },
        )
        if (result.status !== 0 || !existsSync(join(outputDir, "index.ts"))) {
            process.exit(result.status ?? 1)
        }
    } finally {
        rmSync(workDir, { force: true, recursive: true })
    }

    const formatResult = spawnSync("npx", ["biome", "format", "--write", outputDir], {
        cwd: rootDir,
        stdio: "inherit",
    })
    if (formatResult.status !== 0) process.exit(formatResult.status ?? 1)
}

const listFiles = dir => {
    if (!existsSync(dir)) return []
    return readdirSync(dir, { withFileTypes: true }).flatMap(entry => {
        const path = join(dir, entry.name)
        return entry.isDirectory() ? listFiles(path) : [path]
    })
}

const compareGenerated = (actualDir, expectedDir) => {
    const actualFiles = listFiles(actualDir)
        .map(path => relative(actualDir, path))
        .sort()
    const expectedFiles = listFiles(expectedDir)
        .map(path => relative(expectedDir, path))
        .sort()
    const changedFiles = [...new Set([...actualFiles, ...expectedFiles])].filter(file => {
        const actualPath = join(actualDir, file)
        const expectedPath = join(expectedDir, file)
        if (!existsSync(actualPath) || !existsSync(expectedPath)) return true
        if (statSync(actualPath).size !== statSync(expectedPath).size) return true
        return readFileSync(actualPath, "utf8") !== readFileSync(expectedPath, "utf8")
    })

    if (changedFiles.length === 0) return
    console.error("Generated Kvarteret Personal OpenAPI client is stale:")
    for (const file of changedFiles) console.error(`- ${file}`)
    console.error("Run npm run api:generate:personal and commit the generated client.")
    process.exit(1)
}

if (isCheck) {
    const tempDir = mkdtempSync(join(tmpdir(), "kvarteret-personal-client-"))
    try {
        const generatedDir = join(tempDir, "client")
        runGenerator(generatedDir)
        compareGenerated(join(rootDir, OUTPUT_DIR), generatedDir)
    } finally {
        rmSync(tempDir, { force: true, recursive: true })
    }
} else {
    runGenerator(join(rootDir, OUTPUT_DIR))
}
