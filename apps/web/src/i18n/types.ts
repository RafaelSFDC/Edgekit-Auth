export type Locale = 'en' | 'pt-BR';

export interface Translations {
  common: {
    copy: string;
    copied: string;
    cancel: string;
    close: string;
    clear: string;
    loading: string;
    error: string;
    success: string;
    status: string;
    active: string;
    all: string;
    save: string;
    delete: string;
    confirm: string;
    search: string;
    refresh: string;
    actions: string;
  };
  topHeader: {
    online: string;
    impersonateMode: string;
    stopImpersonating: string;
    d1Sqlite: string;
    signOut: string;
    themeTooltip: string;
    languageTooltip: string;
  };
  breadcrumbs: {
    overview: string;
    users: string;
    organizations: string;
    sessions: string;
  };
  sidebar: {
    management: string;
    overview: string;
    users: string;
    organizations: string;
    sessions: string;
    developer: string;
    swaggerUi: string;
    jwks: string;
    quickSearch: string;
  };
  login: {
    title: string;
    subtitle: string;
    emailTab: string;
    passkeyTab: string;
    magicLinkTab: string;
    emailLabel: string;
    emailPlaceholder: string;
    passwordLabel: string;
    passwordPlaceholder: string;
    signInButton: string;
    passkeyButton: string;
    passkeyDesc: string;
    magicLinkButton: string;
    magicLinkDesc: string;
    magicLinkSentTitle: string;
    magicLinkSentDesc: string;
    forgotPasswordLink: string;
    forgotPasswordModalTitle: string;
    forgotPasswordModalDesc: string;
    forgotPasswordSubmit: string;
    forgotPasswordSent: string;
    adminOnlyNotice: string;
    errorCredentials: string;
    errorNotAdmin: string;
    authenticating: string;
  };
  overview: {
    title: string;
    subtitle: string;
    totalUsers: string;
    d1Accounts: string;
    manageUsers: string;
    multiTenancy: string;
    multiTenancyDesc: string;
    manageOrgs: string;
    activeSessions: string;
    activeTokens: string;
    auditSessions: string;
    edgeEngine: string;
    edgeEngineDesc: string;
    recentUsers: string;
    noUsers: string;
  };
  users: {
    title: string;
    subtitle: string;
    searchPlaceholder: string;
    createUser: string;
    table: {
      user: string;
      role: string;
      status: string;
      created: string;
      actions: string;
    };
    createModal: {
      title: string;
      description: string;
      nameLabel: string;
      emailLabel: string;
      passwordLabel: string;
      roleLabel: string;
      submit: string;
    };
    banModal: {
      title: string;
      description: string;
      reasonLabel: string;
      reasonPlaceholder: string;
      confirm: string;
    };
    actions: {
      impersonate: string;
      ban: string;
      unban: string;
      delete: string;
      promoteAdmin: string;
      demoteUser: string;
      changeRole: string;
    };
  };
  organizations: {
    title: string;
    subtitle: string;
    selectOrg: string;
    createOrg: string;
    deleteOrg: string;
    deleteOrgConfirm: string;
    membersTitle: string;
    inviteMember: string;
    changeMemberRole: string;
    removeMember: string;
    removeMemberConfirm: string;
    createModal: {
      title: string;
      description: string;
      nameLabel: string;
      slugLabel: string;
      submit: string;
    };
    inviteModal: {
      title: string;
      description: string;
      emailLabel: string;
      roleLabel: string;
      submit: string;
    };
  };
  sessions: {
    title: string;
    subtitle: string;
    table: {
      device: string;
      ip: string;
      expires: string;
      actions: string;
    };
    revokeSession: string;
    revokeOthers: string;
    revokeOthersConfirm: string;
  };
}
