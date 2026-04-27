import { existsSync, readdirSync } from "node:fs";
import path from "node:path";

type PublicImageKey = "hero" | "about" | "services" | "projects" | "contractor" | "contact";

const imageDir = path.join(process.cwd(), "public", "assets", "images");
const rasterExtensions = [".avif", ".webp", ".jpg", ".jpeg", ".png"];
const fallbackImages: Record<PublicImageKey, string> = {
  hero: "hero-construction.svg",
  about: "about-construction.svg",
  services: "services-construction.svg",
  projects: "projects-construction.svg",
  contractor: "contractor-construction.svg",
  contact: "contact-construction.svg"
};

const preferredImages: Record<PublicImageKey, string[]> = {
  hero: ["hero-main.png", "project-rebar-slab.jpeg", "project-east-perth.jpeg"],
  about: ["project-east-perth.jpeg", "project-rebar-slab.jpeg", "hero-main.png"],
  services: ["project-rebar-slab.jpeg", "project-east-perth.jpeg", "hero-main.png"],
  projects: ["project-rebar-slab.jpeg", "project-east-perth.jpeg", "hero-main.png"],
  contractor: ["hero-main.png", "project-east-perth.jpeg", "project-rebar-slab.jpeg"],
  contact: ["project-east-perth.jpeg", "hero-main.png", "project-rebar-slab.jpeg"]
};

function listPublicImages() {
  if (!existsSync(imageDir)) {
    return [];
  }

  return readdirSync(imageDir).filter((file) => !file.startsWith("."));
}

function chooseImage(files: string[], key: PublicImageKey) {
  const preferred = preferredImages[key].find((file) => files.includes(file));

  if (preferred) {
    return `/assets/images/${preferred}`;
  }

  const matchingRaster = files.find((file) => {
    const lower = file.toLowerCase();
    return lower.includes(key) && rasterExtensions.some((extension) => lower.endsWith(extension));
  });

  const fallback = matchingRaster ?? fallbackImages[key];
  return `/assets/images/${fallback}`;
}

const files = listPublicImages();

export const publicImages: Record<PublicImageKey, string> = {
  hero: chooseImage(files, "hero"),
  about: chooseImage(files, "about"),
  services: chooseImage(files, "services"),
  projects: chooseImage(files, "projects"),
  contractor: chooseImage(files, "contractor"),
  contact: chooseImage(files, "contact")
};
