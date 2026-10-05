export default {
    app: {
        name: "Jeng",
        identifier: "dev.jeng.gui",
        version: "0.1.0",
    },
    build: {
        // A gadget is required and run in bun, so the main process is bun rather
        // than the default runtime: `Bun.$`, `Bun.file` and `require` are the whole
        // gadget contract.
        mainProcess: "bun",
        bun: {
            entrypoint: "packages/jeng-gui/src/main/index.ts",
        },
    },
};
