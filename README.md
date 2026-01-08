# Geano's Scene Rotation

![Geano's Scene Rotation Showcase](https://github.com/GeanoFee/geanos-scene-rotation/blob/main/GSR.jpg?raw=true)

A FoundryVTT module that solves one of the most annoying issues in Foundry: rotating a scene 90 degrees after you've already set it up.

## Features

*   **One-Click Rotation**: Adds a "Rotate Scene" button to the Scene Configuration header.
*   **Complete Data Alignment**: Automatically rotates and realigns:
    *   Walls, Lights, Sounds, Notes
    *   Tokens, Tiles, Drawings
    *   Templates
*   **Smart Image Processing**:
    *   Automatically rotates the **Background** and **Foreground** images.
    *   Saves rotated copies in a `rotated-images` subfolder next to your original image.
    *   **Smart Naming**: Uses `[OriginalName]_rotation[Degrees].jpg`.
    *   **Efficiency**: If a rotated version of the image already exists, it reuses it instantly instead of generating a new one.

## Installation

1.  Place the `geanos-scene-rotation` folder into your `Data/modules/` directory.
2.  Restart Foundry VTT.
3.  Enable the module in **Manage Modules**.

Alternatively:
Enter the Manifest URL `https://github.com/GeanoFee/geanos-scene-rotation/releases/latest/download/module.json` within Foundry's "Install Module" window.

## Usage

1.  Open the **Configuration** window for any Scene.
2.  Click the **Rotate Scene** button located in the window header.
3.  Choose **90° Clockwise** or **90° Counter-Clockwise**.
4.  Wait for the notification confirming the rotation is complete.

## How it works

When you rotate a scene, the module:
1.  Swaps the Scene Width and Height.
2.  Calculates the new coordinates for all embedded objects based on a 90-degree transformation matrix.
3.  Checks if a rotated version of the background image exists in `[OriginalPath]/rotated-images/`.
    *   **If yes**: It assigns that image to the scene.
    *   **If no**: It loads the image into an off-screen canvas, rotates it, saves it as a high-quality JPEG, uploads it, and then assigns it.

## Compatibility

Verified for Foundry VTT v12. Should work on v10+.
