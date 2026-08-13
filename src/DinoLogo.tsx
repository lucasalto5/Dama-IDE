import amberDino from "./assets/dama-dino-amber.png";
import blueDino from "./assets/dama-dino-blue.png";
import greenDino from "./assets/dama-dino-green.png";
import violetDino from "./assets/dama-dino-violet.png";

type DinoLogoProps = {
  className?: string;
  animated?: boolean;
  title?: string;
};

export function DinoLogo({ className = "", animated = false, title }: DinoLogoProps) {
  return (
    <span
      className={`dino-logo ${animated ? "dino-animated" : ""} ${className}`.trim()}
      role={title ? "img" : undefined}
      aria-label={title}
      aria-hidden={title ? undefined : true}
    >
      <img className="dino-logo-amber" src={amberDino} alt="" />
      <img className="dino-logo-blue" src={blueDino} alt="" />
      <img className="dino-logo-green" src={greenDino} alt="" />
      <img className="dino-logo-violet" src={violetDino} alt="" />
    </span>
  );
}
