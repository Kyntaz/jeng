export default {
    // Pinned exactly, because the SDK is projected into .hutch/devkit rather than
    // installed, so an unpinned build would change what `electrobun/main` means.
    electrobun: { version: "2.0.2" },
    // bun owns the dependency graph and the lockfile, as it does for every other
    // package here. Hutch's own resolver would add a second lockfile for one app.
    packageManager: "bun",
};
