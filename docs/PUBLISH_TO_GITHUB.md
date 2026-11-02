# Publish Istaroth v2.4.18 on GitHub — Windows, no CMD

1. Sign into GitHub and create a **public** repository named `Istaroth`, without adding a separate README, license, or .gitignore.
2. Extract `Istaroth_v2.4.18_Gallery_Only_Source.zip`.
3. In GitHub Desktop, choose **File → Add local repository**, select the extracted project folder, and choose **Create repository here** if prompted. Commit your changes and click **Publish repository**; ensure **Keep this code private** is unchecked.
4. Check the public repository contains `app/`, `installer/`, `LICENSE`, `PRIVACY.md` and `.github/workflows/checks.yml`.
5. Open the **Actions** tab and check that the source-check/build workflow succeeds.
6. Under **Releases**, choose **Draft a new release**, create tag `v2.4.18`, title it `Istaroth v2.4.18 — Public Release`, and leave **Set as a pre-release** unchecked.
7. Copy text from `docs/RELEASE_NOTES.md` into the release description. Attach BOTH files from the `Release_Assets` folder: the setup `.exe` and its `.sha256` file.
8. Publish the release. Test that a signed-out visitor can download it. Optionally enable GitHub's **Private vulnerability reporting**.

The setup is not signed. Do not promise that open source removes SmartScreen or guarantees safety. GitHub releases include a source snapshot automatically.
