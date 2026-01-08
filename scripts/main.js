Hooks.on("renderSceneConfig", (app, html, data) => {
    const header = html.find(".window-header");
    const title = header.find(".window-title");

    const rotateBtn = $(`<a class="control"><i class="fas fa-sync-alt"></i> ${game.i18n.localize("SCENEROTATION.RotateButton")}</a>`);

    rotateBtn.on("click", async (event) => {
        event.preventDefault();
        await new RotateSceneDialog(app.document).render(true);
    });

    // Insert before the Close button
    const closeBtn = header.find(".close");
    rotateBtn.insertBefore(closeBtn);
});

class RotateSceneDialog extends Dialog {
    constructor(scene) {
        super({
            title: game.i18n.localize("SCENEROTATION.DialogTitle"),
            content: `<p>${game.i18n.localize("SCENEROTATION.DialogContent")}</p>`,
            buttons: {
                clockwise: {
                    label: game.i18n.localize("SCENEROTATION.Clockwise"),
                    callback: () => this.rotate(scene, 90)
                },
                counterClockwise: {
                    label: game.i18n.localize("SCENEROTATION.CounterClockwise"),
                    callback: () => this.rotate(scene, -90)
                }
            },
            default: "clockwise"
        });
    }

    async rotate(scene, degrees) {
        ui.notifications.info(`Rotating scene ${scene.name} by ${degrees} degrees...`);
        // Logic to be implemented
        const rotator = new SceneRotator(scene);
        await rotator.rotate(degrees);
        ui.notifications.info("Rotation complete.");
    }
}

class SceneRotator {
    constructor(scene) {
        this.scene = scene;
    }

    async rotate(degrees) {
        if (degrees % 90 !== 0) return;

        // Normalize degrees to 90 or -90 (or 180, 270 etc, but UI currently only sends 90/-90)
        // We will loop 90 degree turns if needed, but for now specific logic for 90/-90 is easier to reason about 
        // or just general formula.

        const oldWidth = this.scene.width;
        const oldHeight = this.scene.height;

        // Calculate new dimensions
        // For 90 or -90 (270), width and height swap.
        // For 180, they stay same.
        const isSwap = Math.abs(degrees) % 180 !== 0;
        const newWidth = isSwap ? oldHeight : oldWidth;
        const newHeight = isSwap ? oldWidth : oldHeight;

        // Coordinate Transform Function
        // 90 CW: (x, y) -> (H - y, x)
        // -90 CCW: (x, y) -> (y, W - x)
        // 180: (x, y) -> (W - x, H - y)

        const transform = (x, y) => {
            let nx = x, ny = y;
            // Handle 90 degree steps. For simplicity, let's just handle +90 and -90.
            if (degrees === 90 || degrees === -270) {
                nx = oldHeight - y;
                ny = x;
            } else if (degrees === -90 || degrees === 270) {
                nx = y;
                ny = oldWidth - x;
            } else if (Math.abs(degrees) === 180) {
                nx = oldWidth - x;
                ny = oldHeight - y;
            }
            return { x: nx, y: ny };
        };

        const updates = {};

        // 1. Scene Updates
        updates.width = newWidth;
        updates.height = newHeight;
        // Adjust grid offset if necessary? Usually grid aligns to top-left (0,0). 
        // If there was a shift (legacy), it might need rotation, but modern Foundry uses background offset.
        // scene.background.offsetX/Y -> transform?
        if (this.scene.background && (this.scene.background.offsetX || this.scene.background.offsetY)) {
            // Not strictly supported in V10+ Data Models the same way, check `background.offsetX`.
            // Assuming default 0,0 for now.
        }

        // 2. Embedded Documents
        // Docs to rotate: Token, Tile, Wall, AmbientLight, AmbientSound, Note, Drawing, MeasuredTemplate

        const embeddedTypes = [
            "Token", "Tile", "Wall", "AmbientLight", "AmbientSound", "Note", "Drawing", "MeasuredTemplate"
        ];

        for (const type of embeddedTypes) {
            const collection = this.scene.getEmbeddedCollection(type);
            if (!collection.size) continue;

            const docUpdates = [];
            for (const doc of collection) {
                const update = { _id: doc.id };

                if (type === "Wall") {
                    const c = doc.c;
                    const p1 = transform(c[0], c[1]);
                    const p2 = transform(c[2], c[3]);
                    update.c = [p1.x, p1.y, p2.x, p2.y];
                }
                else if (type === "AmbientLight" || type === "AmbientSound" || type === "Note") {
                    const { x, y } = transform(doc.x, doc.y);
                    update.x = x;
                    update.y = y;
                    if (type === "AmbientLight" && doc.config?.rotation !== undefined) {
                        // Light rotation logic if applicable (e.g. cone)
                        update["config.rotation"] = (doc.config.rotation + degrees) % 360;
                    }
                }
                else if (type === "Token" || type === "Tile" || type === "Drawing") {
                    // Start with center-based logic
                    // These objects have width/height and rotate around their center.
                    // 1. Find Center
                    // Note: Token.width is in grid units. Token.x/y is top-left in pixels.
                    // Tile.width is pixels.

                    // We need PIXEL width/height for center calculation.
                    let pixelW = 0, pixelH = 0;

                    if (type === "Token") {
                        pixelW = (doc.width || 0) * this.scene.grid.size;
                        pixelH = (doc.height || 0) * this.scene.grid.size;
                    } else if (type === "Tile") {
                        pixelW = doc.width || 0;
                        pixelH = doc.height || 0;
                    } else if (type === "Drawing") {
                        // Drawings store dimensions in the shape object
                        pixelW = doc.shape.width || 0;
                        pixelH = doc.shape.height || 0;
                    }

                    // Original Top-Left
                    const ox = doc.x;
                    const oy = doc.y;

                    // Original Center
                    const cx = ox + pixelW / 2;
                    const cy = oy + pixelH / 2;

                    // New Center
                    const { x: ncx, y: ncy } = transform(cx, cy);

                    // New Top-Left
                    // Rotation simply adds to the existing rotation. 
                    // The object itself rotates around its center.
                    // So we just place the center at the new spot.
                    // And update rotation.

                    update.x = ncx - pixelW / 2;
                    update.y = ncy - pixelH / 2;

                    update.rotation = ((doc.rotation || 0) + degrees) % 360;

                    // For Drawings, they might have specific logic for text/polygons, but x/y/rotation helps.
                    // Be careful with freehand drawings (points array).
                    if (type === "Drawing" && doc.shape.type === "p") { // Polygon/Freehand
                        // We need to rotate the points relative to the drawing origin (0,0 local)?
                        // Drawing points are relative to x,y.
                        // Rotating the drawing object handles visual rotation, but hitboxes?
                        // Foundry Drawings apply rotation to the container. So points should strictly remain "relative" 
                        // unless we want to "bake" the rotation.
                        // Changing `rotation` is safer.
                    }
                }
                else if (type === "MeasuredTemplate") {
                    const { x, y } = transform(doc.x, doc.y);
                    update.x = x;
                    update.y = y;
                    update.direction = (doc.direction + degrees) % 360;
                }

                docUpdates.push(update);
            }

            if (docUpdates.length > 0) {
                await this.scene.updateEmbeddedDocuments(type, docUpdates);
            }
        }

        // Update Scene Dimensions

        // 3. Image Rotation (Background & Foreground)
        // We do this BEFORE the final update, so we can include the new paths in the scene update.
        try {
            const imageRotator = new ImageRotator();

            if (this.scene.background.src) {
                ui.notifications.info("Rotating background image...");
                // Backgrounds as JPG to avoid issues/size
                const newBg = await imageRotator.rotateAndUpload(this.scene.background.src, degrees, "image/jpeg");
                if (newBg) updates["background.src"] = newBg;
            }

            // Handle legacy 'img' if present or just ensure we cover bases? 
            // V10+ uses background.src.

            if (this.scene.foreground) {
                ui.notifications.info("Rotating foreground image...");
                // Foregrounds as PNG to preserve transparency
                const newFg = await imageRotator.rotateAndUpload(this.scene.foreground, degrees, "image/png");
                if (newFg) updates.foreground = newFg;
            }
        } catch (err) {
            console.error(err);
            ui.notifications.warn(`Image rotation failed: ${err.message}. Scene will rotate but background image might look wrong.`);
        }

        await this.scene.update(updates);
    }
}

class ImageRotator {
    async rotateAndUpload(path, degrees, mimeType = "image/jpeg") {
        if (!path) return null;

        // Map mime-type to extension
        const extMap = {
            "image/jpeg": "jpg",
            "image/png": "png",
            "image/webp": "webp"
        };
        const ext = extMap[mimeType] || "jpg";

        // --- 1. Determine Paths and Names ---
        const pathParts = path.split("/");
        const filename = pathParts.pop();
        // Decode URI component just in case, though FilePicker usually handles it.
        // But for regex matching, better be safe.
        const decodedFilename = decodeURIComponent(filename);

        // Remove 'path' from parts to get directory
        // If path was "my/maps/temple.jpg", pathParts is now ["my", "maps"]
        // If path was "temple.jpg", pathParts is []
        // We need to re-assemble the directory string later.

        let parentDir = pathParts.join("/");
        // If the current file is ALREADY in a 'rotated-images' folder, we should go up one level for the "Base" directory?
        // User: "create the 'rotated images' folder within the folder the original image is placed in"
        // If we are rotating "rotated-images/temple_rotation90.jpg", the 'original' was in the parent of 'rotated-images'.
        // So we should stick to 'rotated-images' being a sibling of the original.

        let baseName = decodedFilename.substring(0, decodedFilename.lastIndexOf(".")) || decodedFilename;
        let currentRotation = 0;

        // Regex to check for existing rotation
        // Matches: temple_rotation90.jpg -> base: temple, rot: 90
        const rotationMatch = baseName.match(/^(.*)_rotation(-?\d+)$/);

        if (rotationMatch) {
            baseName = rotationMatch[1];
            currentRotation = parseInt(rotationMatch[2], 10);

            // If we are currently in 'rotated-images', step out for the 'parentDir' reference if needed?
            // Actually, we just need to ensure we target `parentDir/rotated-images`.
            // If `parentDir` already ends in `rotated-images`, we stay there?
            // Let's check: "modules/maps/rotated-images"
            // If we want to keep all rotated versions in the same folder, this works.
            // But if we want to follow the rule strictly: "folder original is placed in".
            // Original: "modules/maps/temple.jpg".
            // 90deg: "modules/maps/rotated-images/temple_rotation90.jpg".
            // When rotating that one: parentDir is "modules/maps/rotated-images".
            // Creating "modules/maps/rotated-images/rotated-images" is BAD.

            if (parentDir.endsWith("/rotated-images") || parentDir.endsWith("rotated-images")) {
                // We are already inside. Target is THIS directory.
                // parentDir remains as is.
            } else {
                // We are at root. Target is parentDir + /rotated-images
                parentDir = parentDir ? `${parentDir}/rotated-images` : "rotated-images";
            }
        } else {
            // New rotation from raw file.
            // Target is parentDir + /rotated-images
            parentDir = parentDir ? `${parentDir}/rotated-images` : "rotated-images";
        }

        // Calculate new rotation
        // Normalize to positive 0-360
        let newRotation = (currentRotation + degrees) % 360;
        if (newRotation < 0) newRotation += 360; // handle negatives

        const newFileName = `${baseName}_rotation${newRotation}.${ext}`;
        // Note: We deliberately DO NOT check for existence of a file with a DIFFERENT extension.
        // If user rotates a PNG background to JPG, we check for .jpg validity.
        // Re-encode if necessary? FilePicker usually takes standard strings. 
        // If `baseName` had spaces, they might be decoded now. Best to keep them as is for file system generally, 
        // but Foundry URLs are encoded. 
        // Let's rely on string interpolation.

        // Note: Check source. If path started with "http", we assume S3 or similar but we default to 'data' source for browse/upload usually?
        // Or we assume the user is using User Data.
        // We will try to use the inferred parentDir.

        const targetPath = `${parentDir}/${newFileName}`;

        // --- 2. Check Existence ---
        try {
            // We use FilePicker.browse to check if the file exists in the directory.
            // We need to browse 'parentDir'.
            // Note: FilePicker.browse(source, target)
            // We'll guess source 'data'. If it fails, we might just proceed to generate.

            const result = await FilePicker.browse("data", parentDir).catch(() => null);

            if (result) {
                // Check files list
                // files are full URL/paths. We need to check if one ends with our newFilename.
                // We shouldn't match exact path string because of host/s3 prefix differences.
                const exists = result.files.find(f => decodeURIComponent(f).endsWith(newFileName));

                if (exists) {
                    console.log(`Geano's Rotation: File ${newFileName} already exists. Skipping render.`);
                    return exists; // Return the full path found by Foundry
                }
            }
        } catch (e) {
            // Browse failed (maybe dir doesn't exist yet). Proceed to generate.
        }

        // --- 3. Render and Upload ---

        // Load the *current* image (path)
        const img = await this._loadImage(path);

        // Calculate dimensions (Current Image Dimensions -> Swapped?)
        // If we load the current image, we just rotate it by the DELTA (degrees).
        // e.g. Loaded 90deg image. Rotating +90.
        // Image is 100x200.
        // Canvas should be 200x100.
        // Rotate 90.

        // NOTE: degrees is the step (e.g. 90).
        const isSwap = Math.abs(degrees) % 180 !== 0;
        const width = isSwap ? img.height : img.width;
        const height = isSwap ? img.width : img.height;

        const canvas = document.createElement("canvas");
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext("2d");

        // Translate center
        ctx.translate(width / 2, height / 2);
        ctx.rotate(degrees * Math.PI / 180);
        ctx.drawImage(img, -img.width / 2, -img.height / 2);

        const exportBlob = await new Promise(resolve => canvas.toBlob(resolve, mimeType, 0.9));

        // Create Folder if needed?
        // browse() failure might mean folder missing.
        try {
            await FilePicker.createDirectory("data", parentDir).catch(() => { });
        } catch (e) { }

        const file = new File([exportBlob], newFileName, { type: mimeType });
        const uploadResult = await FilePicker.upload("data", parentDir, file);

        return uploadResult.path;
    }

    _loadImage(src) {
        return new Promise((resolve, reject) => {
            const img = new Image();
            img.crossOrigin = "Anonymous";
            img.onload = () => resolve(img);
            img.onerror = reject;
            img.src = src;
        });
    }
}
