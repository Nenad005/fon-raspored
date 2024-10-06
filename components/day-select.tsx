import { cn } from "@/lib/utils"
import { Button } from "./ui/button"

export default function DaySelect({day, setDay, className = ""}) {
  const dani = ["Ponedeljak", "Utorak", "Sreda", "Četvrtak", "Petak"]
  const daniSkracenice = ["Pon", "Uto", "Sre", "Čet", "Pet"]
  
  return <>
    <div className={cn("flex flex-wrap gap-2", className)}>
      {dani.map((dan, index) => {
        return <Button 
          key={index}
          variant={day == dan ? "default" : "outline"}
          onClick={() => {setDay(dan)}}
          className="py-[5px] h-auto font-light">
          {daniSkracenice[index].toLocaleLowerCase()}
        </Button>
      })}
    </div>
  </>
} 