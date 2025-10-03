use anchor_lang::prelude::*;

declare_id!("HqJ3a7UwwxjorwDJUYMAWBC8Q4fRzqF47Pgq5fjr3D1F");

#[program]
pub mod sib {
    use super::*;

    /// Initialize AdminRegistry PDA with a super admin.
    pub fn init_admin_registry(ctx: Context<InitAdminRegistry>, super_admin: Pubkey) -> Result<()> {
        let reg = &mut ctx.accounts.admin_registry;
        reg.super_admin = super_admin;
        reg.admins = Vec::with_capacity(AdminRegistry::MAX);
        reg.bump = ctx.bumps.admin_registry;
        Ok(())
    }

    /// Add an admin (only super_admin can call).
    pub fn add_admin(ctx: Context<SetAdmin>, new_admin: Pubkey) -> Result<()> {
        ctx.accounts.admin_registry.add_admin(new_admin)
    }

    /// Remove an admin (only super_admin can call).
    pub fn remove_admin(ctx: Context<SetAdmin>, old_admin: Pubkey) -> Result<()> {
        ctx.accounts.admin_registry.remove_admin(old_admin);
        Ok(())
    }

    pub fn add_certificate(
        ctx: Context<AddCertificate>,
        program_studi: String,
        universitas: String,
        kode_batch: String,
        nim: String,
        nama: String,
        nomor_ijazah: String,
        operator_name: String,
        file_uri: String,
        file_hash: [u8; 32],
    ) -> Result<()> {
        require!(
            ctx.accounts
                .admin_registry
                .is_admin(&ctx.accounts.operator.key()),
            SibError::NotAuthorized
        );

        require!(program_studi.len() <= Certificate::FIELD_64, SibError::StringTooLong);
        require!(universitas.len()   <= Certificate::FIELD_64, SibError::StringTooLong);
        require!(kode_batch.len()    <= Certificate::FIELD_32, SibError::StringTooLong);
        require!(nim.len()           <= Certificate::FIELD_32, SibError::StringTooLong);
        require!(nama.len()          <= Certificate::FIELD_64, SibError::StringTooLong);
        require!(nomor_ijazah.len()  <= Certificate::FIELD_64, SibError::StringTooLong);
        require!(operator_name.len() <= Certificate::FIELD_64, SibError::StringTooLong);
        require!(file_uri.len()      <= Certificate::URI_MAX,  SibError::StringTooLong);

        let cert = &mut ctx.accounts.certificate;

        cert.bump             = ctx.bumps.certificate;
        cert.management       = ctx.accounts.operator.key();
        cert.operator_pubkey  = ctx.accounts.operator.key();
        cert.operator_name    = operator_name;

        cert.program_studi    = program_studi;
        cert.universitas      = universitas;
        cert.kode_batch       = kode_batch;
        cert.waktu_masuk      = Clock::get()?.unix_timestamp;
        cert.nim              = nim;
        cert.nama             = nama;
        cert.nomor_ijazah     = nomor_ijazah;

        cert.file_uri         = file_uri;
        cert.file_hash        = file_hash;

        Ok(())
    }

    pub fn update_file(
        ctx: Context<UpdateFile>,
        new_uri: String,
        new_hash: [u8; 32],
    ) -> Result<()> {
        require!(new_uri.len() <= Certificate::URI_MAX, SibError::StringTooLong);

        let cert = &mut ctx.accounts.certificate;
        cert.file_uri = new_uri;
        cert.file_hash = new_hash;
        Ok(())
    }
}


#[derive(Accounts)]
pub struct InitAdminRegistry<'info> {
    #[account(
        init,
        payer = payer,
        space = 8 + AdminRegistry::SIZE,
        seeds = [b"admin",],
        bump
    )]
    pub admin_registry: Account<'info, AdminRegistry>,

    #[account(mut)]
    pub payer: Signer<'info>,

    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct SetAdmin<'info> {
    #[account(
        mut,
        seeds = [b"admin"],
        bump = admin_registry.bump,
        constraint = super_admin.key() == admin_registry.super_admin @ SibError::NotAuthorized
    )]
    pub admin_registry: Account<'info, AdminRegistry>,

    pub super_admin: Signer<'info>,
}

#[derive(Accounts)]
#[instruction(
    program_studi: String,
    universitas: String,
    kode_batch: String,
    nim: String,
    nama: String,
    nomor_ijazah: String,
    operator_name: String,
    file_uri: String
)]
pub struct AddCertificate<'info> {
    #[account(
        init,
        payer = operator,
        space = 8 + Certificate::MAX_SIZE,
        seeds = [b"cert", nomor_ijazah.as_bytes()],
        bump
    )]
    pub certificate: Account<'info, Certificate>,

    #[account(
        seeds = [b"admin"],
        bump = admin_registry.bump
    )]
    pub admin_registry: Account<'info, AdminRegistry>,

    #[account(mut)]
    pub operator: Signer<'info>,

    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct UpdateFile<'info> {
    #[account(
        mut,
        constraint = certificate.management == operator.key() @ SibError::NotAuthorized
    )]
    pub certificate: Account<'info, Certificate>,

    /// The same uploader wallet that created the cert
    pub operator: Signer<'info>,
}

#[account]
pub struct AdminRegistry {
    pub super_admin: Pubkey,
    pub admins: Vec<Pubkey>, // dynamic, but capped by MAX in logic
    pub bump: u8,
}

impl AdminRegistry {
    pub const MAX: usize = 64;
    pub const SIZE: usize = 32 
        + 4 + (32 * Self::MAX)
        + 1 ;

    pub fn is_admin(&self, who: &Pubkey) -> bool {
        if *who == self.super_admin {
            return true;
        }
        self.admins.iter().any(|k| k == who)
    }

    pub fn add_admin(&mut self, who: Pubkey) -> Result<()> {
        require!(self.admins.len() < Self::MAX, SibError::AdminListFull);
        if self.admins.iter().any(|k| *k == who) {
            return Ok(());
        }
        self.admins.push(who);
        Ok(())
    }

    pub fn remove_admin(&mut self, who: Pubkey) {
        self.admins.retain(|k| *k != who);
    }
}

#[account]
pub struct Certificate {
    pub management: Pubkey,        // uploader wallet
    pub operator_pubkey: Pubkey,   // equals uploader
    pub operator_name: String,     // human-readable

    pub program_studi: String,
    pub universitas: String,
    pub kode_batch: String,
    pub waktu_masuk: i64,
    pub nim: String,
    pub nama: String,
    pub nomor_ijazah: String,

    pub file_uri: String,          // Arweave/HTTP link
    pub file_hash: [u8; 32],       // SHA-256

    pub bump: u8,
}

impl Certificate {
    pub const FIELD_32: usize = 32;
    pub const FIELD_64: usize = 64;
    pub const URI_MAX:  usize = 256;

    pub const MAX_SIZE: usize =
        32 +                            // management
        32 +                            // operator_pubkey
        (4 + Self::FIELD_64) +          // operator_name
        (4 + Self::FIELD_64) +          // program_studi
        (4 + Self::FIELD_64) +          // universitas
        (4 + Self::FIELD_32) +          // kode_batch
        8  +                            // waktu_masuk
        (4 + Self::FIELD_32) +          // nim
        (4 + Self::FIELD_64) +          // nama
        (4 + Self::FIELD_64) +          // nomor_ijazah
        (4 + Self::URI_MAX) +           // file_uri
        32 +                            // file_hash
        1;                              // bump
}



#[error_code]
pub enum SibError {
    #[msg("Provided string exceeds the allowed maximum length for its field.")]
    StringTooLong,
    #[msg("You are not authorized to perform this action.")]
    NotAuthorized,
    #[msg("Admin list is full.")]
    AdminListFull,
}
