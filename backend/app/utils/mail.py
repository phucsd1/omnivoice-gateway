import smtplib
from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart
from app.config import settings

def send_verification_email(email: str, username: str, code: str):
    """
    Sends a verification email with the 6-digit OTP code to the user.
    If SMTP credentials are not configured, prints the code to stdout/console.
    """
    subject = "Xác thực tài khoản OmniVoice"
    body = f"""
    Chào {username},
    
    Cảm ơn bạn đã đăng ký tài khoản tại OmniVoice Gateway.
    Mã xác thực đăng ký tài khoản của bạn là:
    
    ============================
             {code}
    ============================
    
    Mã xác thực này sẽ hết hạn sau 10 phút.
    Nếu bạn không yêu cầu đăng ký này, vui lòng bỏ qua email.
    
    Trân trọng,
    Đội ngũ OmniVoice.
    """
    
    # Check if credentials exist
    if not settings.SMTP_USERNAME or not settings.SMTP_PASSWORD:
        print(f"\n=======================================================")
        print(f"[MAIL MOCK] Gửi mail xác thực tới: {email}")
        print(f"[MAIL MOCK] Tên tài khoản: {username}")
        print(f"[MAIL MOCK] Mã OTP đăng ký: {code}")
        print(f"=======================================================\n")
        return True

    try:
        # Create message
        msg = MIMEMultipart()
        msg['From'] = settings.SMTP_FROM
        msg['To'] = email
        msg['Subject'] = subject
        msg.attach(MIMEText(body, 'plain', 'utf-8'))
        
        # Connect to SMTP server
        server = smtplib.SMTP(settings.SMTP_HOST, settings.SMTP_PORT)
        server.starttls()  # Upgrade connection to secure encrypted SSL/TLS
        server.login(settings.SMTP_USERNAME, settings.SMTP_PASSWORD)
        server.sendmail(settings.SMTP_FROM, email, msg.as_string())
        server.quit()
        
        print(f"[SMTP] Đã gửi mail xác thực tới {email} thành công.")
        return True
    except Exception as e:
        print(f"[SMTP ERROR] Không thể gửi mail tới {email}: {e}")
        # Log mock fallback anyway so developer/tester doesn't get blocked
        print(f"\n=======================================================")
        print(f"[FALLBACK LOG] Gửi mail xác thực tới: {email}")
        print(f"[FALLBACK LOG] Tên tài khoản: {username}")
        print(f"[FALLBACK LOG] Mã OTP đăng ký: {code}")
        print(f"=======================================================\n")
        return False
