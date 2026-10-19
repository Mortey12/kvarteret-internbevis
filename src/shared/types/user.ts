export type RabattTrinn = number | null

export interface InternKortVerv {
    navn: string
    gruppe: string
    signertKontrakt: boolean
    rabattTrinn: RabattTrinn
    pingvinPoeng: number
}

export interface InternKortVervHistorikk extends InternKortVerv {
    startet: string | null
    sluttet: string | null
    ar: number | null
    semester: string | null
    aktiv: boolean
}

export interface User {
    id: number
    fornavn: string
    etternavn: string
    fodselsdato: Date | null
    opprettet: Date | null
    gyldigTil: Date
    bildeUrl?: string
    pingvinPoengSum: number
    aktiveVerv: InternKortVerv[]
    vervHistorikk: InternKortVervHistorikk[]
    dagensOrd: string
    proveperiodeUtlopt?: boolean
}

export const createDemoUser = (): User => ({
    id: 0,
    fornavn: "Sir Nils Olav",
    etternavn: "III",
    fodselsdato: new Date(2000, 0, 1),
    opprettet: new Date(),
    gyldigTil: new Date(Date.now() + 180 * 24 * 60 * 60 * 1000),
    pingvinPoengSum: 42,
    aktiveVerv: [
        {
            navn: "Utvikler",
            gruppe: "E-Tjenesten",
            signertKontrakt: true,
            rabattTrinn: 3,
            pingvinPoeng: 12,
        },
        {
            navn: "Medlem",
            gruppe: "PR-Etaten",
            signertKontrakt: false,
            rabattTrinn: 2,
            pingvinPoeng: 6,
        },
    ],
    vervHistorikk: [
        {
            navn: "Utvikler",
            gruppe: "E-Tjenesten",
            signertKontrakt: true,
            rabattTrinn: 3,
            pingvinPoeng: 12,
            startet: null,
            sluttet: null,
            ar: new Date().getFullYear(),
            semester: "Høst",
            aktiv: true,
        },
    ],
    dagensOrd: "eplepingvin",
    bildeUrl: "assets/images/nils.jpg",
})
