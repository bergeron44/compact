"""Updates certifi bundle with Dell Technologies certificates."""
import logging
import requests
import zipfile
import io
import certifi

logger = logging.getLogger(__name__)


def update_certifi_with_dell_certs():
    """Download and append Dell certificates to certifi bundle.
    
    Downloads the Dell Technologies PKI certificate bundle and adds the
    root and issuing certificates to the system's certifi bundle.
    
    This is required for SSL connections to Dell internal services like
    the AIA Gateway.
    
    Raises:
        KeyError: If expected certificate files are missing from the zip
        Exception: If download or installation fails
    """
    url = "https://pki.dell.com//Dell%20Technologies%20PKI%202018%20B64_PEM.zip"
    
    logger.info("Downloading Dell certificates from: %s", url)
    
    try:
        response = requests.get(url)
        response.raise_for_status()
        logger.info("Downloaded certificate zip, size: %d bytes", len(response.content))
        
        cert_path = certifi.where()
        logger.info("Certifi bundle path: %s", cert_path)
        
        dell_root_cert_name = "Dell Technologies Root Certificate Authority 2018.pem"
        dell_issuing_cert_name = "Dell Technologies Issuing CA 101_new.pem"
        
        with zipfile.ZipFile(io.BytesIO(response.content)) as z:
            root_cert_content = z.read(dell_root_cert_name).decode('utf-8')
            issuing_cert_content = z.read(dell_issuing_cert_name).decode('utf-8')
            
            with open(cert_path, "a") as bundle:
                bundle.write("\n")
                bundle.write(root_cert_content)
                bundle.write("\n")
                bundle.write(issuing_cert_content)
                bundle.write("\n")
        
        logger.info("Dell certificates successfully added to certifi bundle")
        
    except KeyError as e:
        logger.error("Certificate file '%s' not found in zip archive", e)
        raise
    except Exception as e:
        logger.error("Error during certificate update: %s", e)
        raise
