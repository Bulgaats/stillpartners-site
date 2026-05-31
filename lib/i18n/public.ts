export type PublicLanguage = "en" | "mn";

export const publicLanguageCookie = "still_partners_lang";

export const publicLanguages: PublicLanguage[] = ["en", "mn"];

export function normalizePublicLanguage(value?: string | null): PublicLanguage {
  return value === "mn" ? "mn" : "en";
}

export const publicMessages = {
  en: {
    nav: {
      about: "About",
      subcontractors: "Subcontractors",
      clients: "Capabilities",
      contact: "Contact",
      internalBeta: "Internal Beta",
      languageLabel: "Language"
    },
    footer: {
      description:
        "Perth-based construction subcontract services for commercial projects needing reinforcement support, practical coordination, and clear completion records.",
      publicSite: "Public site",
      projectEnquiry: "Project Enquiry",
      joinContractor: "Join as Subcontractor",
      contact: "Contact",
      location: "Perth, Western Australia",
      copyright:
        "Still Partners Pty Ltd. Perth, Western Australia construction subcontract services."
    },
    home: {
      eyebrow: "Perth WA Construction Subcontract Services",
      heroTitle: "Reinforcement Subcontract Services Across WA",
      heroCopy:
        "Still Partners Pty Ltd supports commercial construction projects through reinforcement subcontract services, practical project coordination, completion records, and quality workmanship.",
      projectEnquiry: "Discuss Your Project",
      joinContractor: "Join as Subcontractor",
      builtForSite: "Built for site delivery",
      heroCards: ["Reinforcement services", "Carpentry scope support", "Project delivery coordination"],
      widerWa: "Perth and wider WA project support.",
      aboutEyebrow: "Still Partners Pty Ltd",
      aboutTitle: "Perth-based subcontract support for commercial construction.",
      aboutCopy:
        "We help main contractors keep projects moving through agreed subcontract scopes, site documentation, completion records, safety-aware systems, and practical project support when site demands change.",
      trustBadges: ["Perth based", "Site ready", "Safety aware"],
      servicesEyebrow: "Services",
      servicesTitle: "Construction subcontract support",
      services: [
        ["Reinforcement Services", "Reinforcement subcontract services for tying, placement support, reo packages, and project delivery."],
        ["Reinforcement Solutions", "Support for reinforcement scope delivery across reo packages, slabs, columns, walls, and changing project demands."],
        ["Project Support", "Construction subcontract services supporting agreed site packages, daily scope records, and completion tracking."],
        ["Construction Subcontract Services", "Project coordination and subcontract package support for commercial builders and main contractors across Perth."]
      ],
      whyEyebrow: "Why choose us",
      whyTitle: "Serious site support for agreed scopes, records, and project outcomes.",
      reasons: ["Safety First", "Reliable Delivery", "On Time", "Flexible Scope Support", "Quality Workmanship"],
      projectEyebrow: "Project highlights",
      projectTitle: "Visual proof for serious construction sites.",
      projectHighlights: [
        {
          title: "Commercial reinforcement",
          copy: "Reinforcement package support for active reo works, slab preparation, walls, columns, and programme pressure."
        },
        {
          title: "Site-ready project support",
          copy: "Reliable project support for daily site requirements, inductions, start times, completion records, and agreed scope coordination."
        },
        {
          title: "Perth project coverage",
          copy: "Flexible project support for Perth builders managing changing site conditions and reinforcement programme demands."
        }
      ],
      contractorTitle: "Skilled subcontractor?",
      contractorCopy:
        "Register your interest for Perth steelfixing, carpentry, and construction subcontract opportunities.",
      contactEyebrow: "Project support enquiry",
      contactTitle: "Discuss your project.",
      phone: "Phone:",
      email: "Email:",
      location: "Location:",
      bestFor: "Best for:",
      emailValue: "work@stillpartners.net",
      locationValue: "Perth, Western Australia",
      contactCaption:
        "For project support enquiries, subcontractor applications, and scope coordination, email work@stillpartners.net or use the form.",
      contactBestFor: "Project support, subcontractor applications, and scope enquiries",
      clientFormButton: "Submit project enquiry"
    },
    about: {
      eyebrow: "About us",
      title: "Practical construction subcontracting for Perth sites.",
      copy:
        "Still Partners Pty Ltd supports commercial construction projects through defined subcontract scopes, reinforcement services, clear communication, and practical site administration.",
      focusTrades: "Focus scopes",
      trades: [
        "Reinforcement fixing works",
        "Formwork and fit-out support",
        "Construction subcontract packages"
      ],
      cards: [
        ["Local coordination", "Perth-focused project administration, site documentation, and completion reporting."],
        ["Subcontractor records", "ABN, White Card, certificates, and onboarding details handled with clear administration."],
        ["Output tracking", "Work completion records help support cleaner site reporting and invoice preparation."]
      ],
      helpTitle: "How we help",
      helpCopy:
        "We support main contractors through agreed subcontract scopes, site requirements, start-time coordination, completion records, and practical project administration.",
      cta: "Contact Still Partners"
    },
    client: {
      eyebrow: "For main contractors",
      title: "Commercial project enquiry.",
      copy:
        "Tell us about your project location, scope requirements, expected timeframe, and scope of works. We support commercial builders through subcontract package support, project coordination, and practical site administration.",
      includeTitle: "What to include",
      includeCopy:
        "Project address, trade mix, estimated timeframe, duration, scope of works, and site contact details.",
      formNote:
        "This project enquiry is directed to work@stillpartners.net for Still Partners follow-up. Still Partners supports construction projects through agreed subcontract scopes, project coordination, and site administration. Engagement terms, site requirements, and scope of works are confirmed before work starts.",
      button: "Submit project enquiry"
    },
    subcontractor: {
      eyebrow: "Subcontractor registration",
      title: "Register for Perth construction subcontracting work.",
      copy:
        "Tell us your trade, ABN, White Card status, and availability for steelfixing, carpentry, and construction subcontract opportunities.",
      checklist: ["ABN and trade details", "White Card and certificates", "Perth project availability and preferred trades"],
      whiteCard: "I have a White Card",
      formNote:
        "Subcontractor applications are directed to work@stillpartners.net for review. Still Partners delivers subcontract package support for construction projects. Engagement terms, site requirements, and scope of works are confirmed before work starts.",
      button: "Register as subcontractor"
    },
    contact: {
      eyebrow: "Contact",
      title: "Contact Still Partners",
      copy:
        "Send a message about project support, subcontractor onboarding, or an upcoming Perth construction project.",
      serviceArea: "Service area:",
      serviceAreaValue: "Perth, Western Australia",
      caption:
        "For reinforcement subcontract services, project support, and subcontractor onboarding, contact work@stillpartners.net.",
      formNote:
        "Messages submitted here are directed to work@stillpartners.net. Still Partners supports construction projects through agreed subcontract scopes, project coordination, and site administration. Engagement terms, site requirements, and scope of works are confirmed before work starts.",
      button: "Send message"
    },
    forms: {
      companyName: "Company name",
      contactName: "Contact name",
      fullName: "Full name",
      name: "Name",
      email: "Email",
      phone: "Phone",
      requiredTrades: "Scope requirements",
      projectLocation: "Project location",
      projectDescription: "Project description",
      timeframe: "Estimated timeframe",
      message: "Message",
      trade: "Trade",
      abn: "ABN",
      availability: "Availability or message",
      subject: "Subject",
      submitError:
        "We could not submit the form just now. Please email work@stillpartners.net or try again shortly."
    },
    thanks: {
      title: "Message received",
      demo:
        "This local demo captured the form safely without Supabase. Configure Supabase before using the form for live enquiries.",
      live:
        "Still Partners has received your details. We will review the enquiry and respond through the contact information provided.",
      back: "Back to site"
    }
  },
  mn: {
    nav: {
      about: "Бидний тухай",
      subcontractors: "Гүйцэтгэгчид",
      clients: "Чадамж",
      contact: "Холбоо барих",
      internalBeta: "Дотоод бета",
      languageLabel: "Хэл"
    },
    footer: {
      description:
        "Перт хотод төвтэй Still Partners нь арилжааны барилгын төслүүдэд арматурын дэмжлэг, практик зохицуулалт, гүйцэтгэлийн тодорхой бүртгэлтэй туслан гүйцэтгэх үйлчилгээ үзүүлдэг.",
      publicSite: "Сайтын цэс",
      projectEnquiry: "Төслийн лавлагаа",
      joinContractor: "Туслан гүйцэтгэгчээр бүртгүүлэх",
      contact: "Холбоо барих",
      location: "Перт, Баруун Австрали",
      copyright:
        "Still Partners Pty Ltd. Перт, Баруун Австралийн барилгын туслан гүйцэтгэх үйлчилгээ."
    },
    home: {
      eyebrow: "Перт, WA барилгын туслан гүйцэтгэх үйлчилгээ",
      heroTitle: "WA даяарх арматурын туслан гүйцэтгэх үйлчилгээ",
      heroCopy:
        "Still Partners Pty Ltd нь арилжааны барилгын төслүүдэд арматурын туслан гүйцэтгэх үйлчилгээ, төслийн практик зохицуулалт, гүйцэтгэлийн бүртгэл, чанартай гүйцэтгэлээр дэмжлэг үзүүлдэг.",
      projectEnquiry: "Төслөө ярилцах",
      joinContractor: "Туслан гүйцэтгэгчээр бүртгүүлэх",
      builtForSite: "Талбайн ажлын хэрэгцээнд",
      heroCards: ["Арматурын үйлчилгээ", "Мужааны ажлын хүрээний дэмжлэг", "Төслийн гүйцэтгэлийн зохицуулалт"],
      widerWa: "Перт болон WA-ийн төслүүдэд дэмжлэг үзүүлнэ.",
      aboutEyebrow: "Still Partners Pty Ltd",
      aboutTitle: "Пертэд төвтэй, арилжааны барилгын туслан гүйцэтгэх дэмжлэг.",
      aboutCopy:
        "Бид үндсэн гүйцэтгэгчдийн төслийг тохиролцсон туслан гүйцэтгэх ажлын хүрээ, талбайн баримтжуулалт, гүйцэтгэлийн бүртгэл, аюулгүй ажиллагаанд анхаарсан систем, талбайн шаардлага өөрчлөгдөхөд хэрэгтэй практик төслийн дэмжлэгээр урагшлуулахад тусалдаг.",
      trustBadges: ["Пертэд төвтэй", "Талбайд бэлэн", "Аюулгүй ажиллагаа"],
      servicesEyebrow: "Үйлчилгээ",
      servicesTitle: "Барилгын туслан гүйцэтгэх дэмжлэг",
      services: [
        ["Арматурын үйлчилгээ", "Арматур зангидах, байрлуулах, reo багц ажил болон төслийн гүйцэтгэлд зориулсан арматурын туслан гүйцэтгэх үйлчилгээ."],
        ["Арматурын ажлын шийдэл", "Reo багц, хавтан, багана, хана болон төслийн шаардлага өөрчлөгдөх үед арматурын ажлын хүрээний гүйцэтгэлийг дэмжинэ."],
        ["Төслийн дэмжлэг", "Тохиролцсон талбайн багц ажил, өдөр тутмын ажлын хүрээний бүртгэл, гүйцэтгэлийн хяналтыг дэмжих барилгын туслан гүйцэтгэх үйлчилгээ."],
        ["Барилгын туслан гүйцэтгэх үйлчилгээ", "Перт дэх арилжааны барилга болон үндсэн гүйцэтгэгчдэд төслийн зохицуулалт, туслан гүйцэтгэх багц ажлын дэмжлэг."]
      ],
      whyEyebrow: "Яагаад биднийг сонгох вэ",
      whyTitle: "Тохиролцсон ажлын хүрээ, бүртгэл, төслийн үр дүнд төвлөрсөн талбайн дэмжлэг.",
      reasons: ["Аюулгүй байдал", "Найдвартай баг", "Цаг баримтална", "Уян хатан мэргэжлийн дэмжлэг", "Чанартай гүйцэтгэл"],
      projectEyebrow: "Төслийн онцлох ажил",
      projectTitle: "Бодит барилгын талбайд нийцсэн найдвартай дэмжлэг.",
      projectHighlights: [
        {
          title: "Арилжааны арматурын ажил",
          copy: "Идэвхтэй reo ажил, хавтангийн бэлтгэл, хана, багана болон хугацааны шахалттай ажлуудад арматурын багц ажлын дэмжлэг."
        },
        {
          title: "Талбайд бэлэн төслийн дэмжлэг",
          copy: "Өдөр тутмын талбайн шаардлага, зааварчилгаа, эхлэх цаг, гүйцэтгэлийн бүртгэл болон тохиролцсон ажлын хүрээний зохицуулалтад найдвартай дэмжлэг."
        },
        {
          title: "Перт дэх төслийн хамрах хүрээ",
          copy: "Талбайн нөхцөл болон арматурын хөтөлбөрийн шаардлага өөрчлөгдөх үед Перт хотын барилгачдад уян хатан төслийн дэмжлэг үзүүлнэ."
        }
      ],
      contractorTitle: "Ур чадвартай туслан гүйцэтгэгч үү?",
      contractorCopy:
        "Перт дэх арматур, мужаан болон барилгын туслан гүйцэтгэх боломжид хамрагдах сонирхлоо бүртгүүлээрэй.",
      contactEyebrow: "Төслийн дэмжлэгийн лавлагаа",
      contactTitle: "Төслийнхөө талаар ярилцъя.",
      phone: "Утас:",
      email: "Имэйл:",
      location: "Байршил:",
      bestFor: "Зориулалт:",
      emailValue: "work@stillpartners.net",
      locationValue: "Перт, Баруун Австрали",
      contactCaption:
        "Төслийн дэмжлэг, гүйцэтгэгчийн бүртгэл болон ажлын хүрээний лавлагааны талаар work@stillpartners.net хаягаар эсвэл маягтаар холбогдоно уу.",
      contactBestFor: "Төслийн дэмжлэг, гүйцэтгэгчийн бүртгэл, ажлын хүрээний лавлагаа",
      clientFormButton: "Төслийн лавлагаа илгээх"
    },
    about: {
      eyebrow: "Бидний тухай",
      title: "Перт дэх барилгын талбайд зориулсан практик туслан гүйцэтгэх үйлчилгээ.",
      copy:
        "Still Partners Pty Ltd нь арилжааны барилгын төслүүдэд тодорхой туслан гүйцэтгэх ажлын хүрээ, арматурын үйлчилгээ, тодорхой харилцаа, талбайн практик удирдлагаар дэмжлэг үзүүлдэг.",
      focusTrades: "Гол мэргэжлүүд",
      trades: [
        "Арматурын ажилд арматурчид",
        "Хэв хашмал болон мужааны дэмжлэг",
        "Барилгын туслан гүйцэтгэх багц ажлууд"
      ],
      cards: [
        ["Орон нутгийн зохицуулалт", "Перт дэх төслийн удирдлага, талбайн баримтжуулалт, гүйцэтгэлийн тайланг дэмжинэ."],
        ["Гүйцэтгэгчийн бүртгэл", "ABN, White Card, гэрчилгээ болон бүртгэлийн мэдээллийг цэгцтэй удирдана."],
        ["Гүйцэтгэлийн бүртгэл", "Ажлын гүйцэтгэлийн бүртгэл нь талбайн тайлан болон нэхэмжлэх бэлтгэлд тусална."]
      ],
      helpTitle: "Бид хэрхэн тусалдаг вэ",
      helpCopy:
        "Бид үндсэн гүйцэтгэгчдэд тохиролцсон туслан гүйцэтгэх ажлын хүрээ, талбайн шаардлага, эхлэх цагийн зохицуулалт, гүйцэтгэлийн бүртгэл, төслийн практик удирдлагаар дэмжлэг үзүүлдэг.",
      cta: "Still Partners-тэй холбогдох"
    },
    client: {
      eyebrow: "Үндсэн гүйцэтгэгчдэд",
      title: "Арилжааны төслийн лавлагаа.",
      copy:
        "Төслийн байршил, ажлын хүрээний шаардлага, төлөвлөсөн хугацаа болон ажлын хүрээгээ илгээнэ үү. Бид арилжааны барилгын компаниудад туслан гүйцэтгэх багц ажлын дэмжлэг, төслийн зохицуулалт, талбайн практик удирдлагаар дэмжлэг үзүүлдэг.",
      includeTitle: "Юуг оруулах вэ",
      includeCopy:
        "Төслийн хаяг, шаардлагатай мэргэжил, тооцоолсон хугацаа, ажлын хүрээ болон талбайн холбоо барих мэдээлэл.",
      formNote:
        "Энэ төслийн лавлагаа work@stillpartners.net хаяг руу чиглэж, Still Partners хариу холбогдоно. Still Partners нь тохиролцсон туслан гүйцэтгэх ажлын хүрээ, төслийн зохицуулалт, талбайн удирдлагаар барилгын төслүүдийг дэмждэг. Ажил эхлэхээс өмнө нөхцөл, талбайн шаардлага, ажлын хүрээг баталгаажуулна.",
      button: "Төслийн лавлагаа илгээх"
    },
    subcontractor: {
      eyebrow: "Туслан гүйцэтгэгчийн бүртгэл",
      title: "Перт дэх барилгын туслан гүйцэтгэгчийн ажилд бүртгүүлэх.",
      copy:
        "Өөрийн мэргэжил, ABN, White Card болон арматур, мужаан, барилгын туслан гүйцэтгэх боломжоо бидэнд илгээнэ үү.",
      checklist: ["ABN болон мэргэжлийн мэдээлэл", "White Card болон гэрчилгээ", "Перт дэх төслийн боломж ба илүүд үзэх мэргэжил"],
      whiteCard: "Надад White Card байгаа",
      formNote:
        "Туслан гүйцэтгэгчийн бүртгэлийн мэдээлэл work@stillpartners.net хаягаар хянагдана. Still Partners нь барилгын төслүүдэд туслан гүйцэтгэх багц ажлын дэмжлэг үзүүлдэг. Ажил эхлэхээс өмнө нөхцөл, талбайн шаардлага, ажлын хүрээг баталгаажуулна.",
      button: "Туслан гүйцэтгэгчээр бүртгүүлэх"
    },
    contact: {
      eyebrow: "Холбоо барих",
      title: "Still Partners-тэй холбогдох",
      copy:
        "Төслийн дэмжлэг, туслан гүйцэтгэгчийн бүртгэл эсвэл Перт дэх удахгүй эхлэх барилгын төслийн талаар мессеж илгээнэ үү.",
      serviceArea: "Үйлчлэх бүс:",
      serviceAreaValue: "Перт, Баруун Австрали",
      caption:
        "Арматурын туслан гүйцэтгэх үйлчилгээ, төслийн дэмжлэг болон гүйцэтгэгчийн бүртгэлийн талаар work@stillpartners.net хаягаар холбогдоно уу.",
      formNote:
        "Энд илгээсэн мессеж work@stillpartners.net хаяг руу чиглэнэ. Still Partners нь тохиролцсон туслан гүйцэтгэх ажлын хүрээ, төслийн зохицуулалт, талбайн удирдлагаар барилгын төслүүдийг дэмждэг. Ажил эхлэхээс өмнө нөхцөл, талбайн шаардлага, ажлын хүрээг баталгаажуулна.",
      button: "Мессеж илгээх"
    },
    forms: {
      companyName: "Компанийн нэр",
      contactName: "Холбоо барих хүний нэр",
      fullName: "Бүтэн нэр",
      name: "Нэр",
      email: "Имэйл",
      phone: "Утас",
      requiredTrades: "Ажлын хүрээний шаардлага",
      projectLocation: "Төслийн байршил",
      projectDescription: "Төслийн тайлбар",
      timeframe: "Тооцоолсон хугацаа",
      message: "Мессеж",
      trade: "Мэргэжил",
      abn: "ABN",
      availability: "Ажиллах боломж эсвэл мессеж",
      subject: "Гарчиг",
      submitError:
        "Маягтыг одоогоор илгээж чадсангүй. work@stillpartners.net хаягаар имэйл илгээх эсвэл түр хүлээгээд дахин оролдоно уу."
    },
    thanks: {
      title: "Мессеж хүлээн авлаа",
      demo:
        "Орон нутгийн demo горимд таны маягтыг Supabase ашиглахгүйгээр аюулгүй хүлээн авлаа. Live хүсэлт авахын өмнө Supabase тохируулна уу.",
      live:
        "Still Partners таны мэдээллийг хүлээн авлаа. Бид хүсэлтийг шалгаад өгсөн холбоо барих мэдээллээр хариу өгнө.",
      back: "Сайт руу буцах"
    }
  }
} as const;

export type PublicMessages = typeof publicMessages.en;
