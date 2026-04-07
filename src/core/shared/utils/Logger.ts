const ANSI_RESET = "\x1b[0m";
const ANSI_BLUE = "\x1b[34m";
const ANSI_YELLOW = "\x1b[33m";
const ANSI_RED = "\x1b[31m";

export class Logger {
    private readonly name: string;

    constructor(name: string) {
        this.name = name;
    }

    public info(message: string) {
        console.log(`${ANSI_BLUE}[INFO]${ANSI_RESET} ${this.name} - ${message}${ANSI_RESET}`);
    }

    public warn(message: string) {
        console.warn(`${ANSI_YELLOW}[WARN]${ANSI_RESET} ${this.name} - ${message}${ANSI_RESET}`);
    }

    public error(message: string) {
        console.error(`${ANSI_RED}[ERROR]${ANSI_RESET} ${this.name} - ${message}${ANSI_RESET}`);
    }
}