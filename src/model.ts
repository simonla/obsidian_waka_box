export interface Summary {
    cumulative_total: CumulativeTotal
    daily_average: DailyAverage
    data: Daum[]
    end: string
    start: string
}

export interface CumulativeTotal {
    decimal: string
    digital: string
    seconds: number
    text: string
}

export interface DailyAverage {
    days_including_holidays: number
    days_minus_holidays: number
    holidays: number
    seconds: number
    seconds_including_other_language: number
    text: string
    text_including_other_language: string
}

export interface Daum {
    categories: Category[]
    dependencies: Dependency[]
    editors: Editor[]
    grand_total: GrandTotal
    languages: Language[]
    machines: Machine[]
    operating_systems: OperatingSystem[]
    projects: Project[]
    range: Range
}

export interface Category {
    decimal: string
    digital: string
    hours: number
    minutes: number
    name: string
    percent: number
    seconds: number
    text: string
    total_seconds: number
}

export interface Dependency {
    decimal: string
    digital: string
    hours: number
    minutes: number
    name: string
    percent: number
    seconds: number
    text: string
    total_seconds: number
}

export interface Editor {
    decimal: string
    digital: string
    hours: number
    minutes: number
    name: string
    percent: number
    seconds: number
    text: string
    total_seconds: number
}

export interface GrandTotal {
    decimal: string
    digital: string
    hours: number
    minutes: number
    text: string
    total_seconds: number
}

export interface Language {
    decimal: string
    digital: string
    hours: number
    minutes: number
    name: string
    percent: number
    seconds: number
    text: string
    total_seconds: number
}

export interface Machine {
    decimal: string
    digital: string
    hours: number
    machine_name_id: string
    minutes: number
    name: string
    percent: number
    seconds: number
    text: string
    total_seconds: number
}

export interface OperatingSystem {
    decimal: string
    digital: string
    hours: number
    minutes: number
    name: string
    percent: number
    seconds: number
    text: string
    total_seconds: number
}

export interface Project {
    color: any
    decimal: string
    digital: string
    hours: number
    minutes: number
    name: string
    percent: number
    seconds: number
    text: string
    total_seconds: number
}

export interface Range {
    date: string
    end: string
    start: string
    text: string
    timezone: string
}
