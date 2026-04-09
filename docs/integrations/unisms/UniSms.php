<?php

// UniSMS API official library
// https://unismsapi.com
class UniSms {
  public const API_URL = 'https://unismsapi.com/api/sms';
  private $secret_key;
  public $recipient;
  public $content;

  public function __construct($secret_key) {
    $this->secret_key = $secret_key;
  }

  public function get($id) {
    if (!isset($id)) throw new Exception("Secret key must be set.");

    $ch = curl_init(self::API_URL . "/$id");

    curl_setopt($ch, CURLOPT_USERPWD, "$this->secret_key:");
    curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);

    $response = curl_exec($ch);
    curl_close($ch);

    return $response;
  }

  public function send() {
    if (!isset($this->secret_key)) throw new Exception("Secret key must be set.");

    if (!isset($this->recipient)) throw new Exception("Recipient key must be set.");

    if (!isset($this->content)) throw new Exception("SMS content message is empty.");

    $payload = json_encode([
      "recipient" => $this->recipient,
      "content" => $this->content
    ]);

    $ch = curl_init(self::API_URL);

    curl_setopt_array($ch, [
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_POST           => true,
        CURLOPT_POSTFIELDS     => $payload,
        CURLOPT_HTTPAUTH       => CURLAUTH_BASIC,
        CURLOPT_USERPWD        => "$this->secret_key:",
        CURLOPT_HTTPHEADER     => [
            'Content-Type: application/json',
            'Content-Length: ' . strlen($payload)
        ],
    ]);

    $response = curl_exec($ch);

    if (curl_errno($ch)) {
        echo 'Error: ' . curl_error($ch);
        curl_close($ch);
    } else {
        curl_close($ch);
        return $response;
    }
  }
}
?>
