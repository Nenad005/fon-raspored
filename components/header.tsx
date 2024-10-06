import SettingButton from "./settings-button";
import { ModeToggle } from "./ui/mode-toggle";

export default function Header() {
  return <>
    <header className="w-full flex justify-center border-b">
      <div className="flex justify-start w-full md:w-[760px] items-center px-5 py-2 gap-3">
        <img  src="https://oas.fon.bg.ac.rs/wp-content/uploads/2023/04/FON-Logo-Tamni.png.webp"
              className="h-16 aspect-auto dark:brightness-0 dark:invert mr-auto"></img>
        <ModeToggle></ModeToggle>
        <SettingButton></SettingButton>
      </div>
    </header>
  </>
}